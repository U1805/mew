package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"mew/plugins/sdk"
)

type taskState struct {
	Seen []string `json:"seen,omitempty"`
}

type BiliBotRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []BiliTaskConfig
}

func NewBiliBotRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*BiliBotRunner, error) {
	tasks, err := parseBiliTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &BiliBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *BiliBotRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	biliClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 20 * time.Second})
	if err != nil {
		return err
	}
	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}
	uploadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 90 * time.Second})
	if err != nil {
		return err
	}

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		idx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runTask(ctx, biliClient, webhookClient, uploadClient, r.apiBase, r.serviceType, r.botID, r.botName, idx, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}

func runTask(
	ctx context.Context,
	biliClient *http.Client,
	webhookClient *http.Client,
	uploadClient *http.Client,
	apiBase, serviceType, botID, botName string,
	idx int,
	task BiliTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[bili-fetcher] bot=%s task=%d uid=%s", botID, idx, task.UID)

	store := sdk.OpenTaskState[taskState](serviceType, botID, idx, task.UID)
	state, err := store.Load()
	if err != nil {
		log.Printf("%s load state failed: %v", logPrefix, err)
	}

	seen := sdk.NewSeenSet(1000)
	for _, id := range state.Seen {
		seen.Add(id)
	}

	firstRun := true
	sendHistory := sdk.BoolOrDefault(task.SendHistoryOnStart, false)

	work := func() {
		items, err := fetchBiliDynamics(ctx, biliClient, task.UID)
		if err != nil {
			log.Printf("%s fetch failed: %v", logPrefix, err)
			return
		}

		// Reverse to process oldest new item first
		for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
			items[i], items[j] = items[j], items[i]
		}

		newItems := make([]APIItem, 0)

		if firstRun && !sendHistory && len(state.Seen) == 0 {
			for _, item := range items {
				seen.Add(item.IDStr)
			}
			log.Printf(
				"%s init done, cached %d items (send_history_on_start=false, skipping history; will post only new items; state=%s)",
				logPrefix,
				len(items),
				store.Path,
			)
		} else {
			if firstRun && sendHistory && len(state.Seen) > 0 {
				log.Printf(
					"%s send_history_on_start=true but state already has %d seen items; history will NOT be resent unless you clear state=%s",
					logPrefix,
					len(state.Seen),
					store.Path,
				)
			}
			for _, item := range items {
				if item.IDStr != "" && !seen.Has(item.IDStr) {
					newItems = append(newItems, item)
				}
			}
		}
		firstRun = false

		if len(newItems) > 0 {
			log.Printf("%s found %d new items", logPrefix, len(newItems))
		}

		tCtx := transformContext{
			ctx:          ctx,
			phClient:     biliClient,
			uploadClient: uploadClient,
			apiBase:      apiBase,
			webhookURL:   task.Webhook,
			logPrefix:    logPrefix,
		}

		for _, item := range newItems {
			msg, err := transformItemToWebhook(tCtx, item)
			if err != nil {
				log.Printf("%s transform item %s failed: %v", logPrefix, item.IDStr, err)
				continue
			}

			if err := sdk.PostWebhook(ctx, webhookClient, apiBase, task.Webhook, *msg, 3); err != nil {
				log.Printf("%s post webhook failed: %v", logPrefix, err)
			} else {
				seen.Add(item.IDStr)
				log.Printf("%s posted dynamic: %s", logPrefix, item.IDStr)
			}
		}

		state.Seen = seen.Snapshot()
		_ = store.Save(state)
	}

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { work() })
}
