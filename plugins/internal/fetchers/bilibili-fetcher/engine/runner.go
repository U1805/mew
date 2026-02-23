package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/internal/fetchers/bilibili-fetcher/config"
	"mew/plugins/internal/fetchers/bilibili-fetcher/source"
	"mew/plugins/pkg"
)

type Runner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []config.TaskConfig
}

func NewRunner(botID, botName, accessToken string, cfg sdk.RuntimeConfig, tasks []config.TaskConfig) *Runner {
	return &Runner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}
}

func (r *Runner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	biliHTTP, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:   30 * time.Second,
		CookieJar: true,
	})
	if err != nil {
		return err
	}
	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 15 * time.Second,
		Mode:    "direct",
	})
	if err != nil {
		return err
	}
	downloadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 45 * time.Second,
	})
	if err != nil {
		return err
	}
	uploadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 90 * time.Second,
		Mode:    "direct",
	})
	if err != nil {
		return err
	}

	srcClient := source.NewClient(biliHTTP)

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}

		taskIdx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[bili-fetcher] bot=%s task=%d uid=%s", r.botID, taskIdx, taskCopy.UID)

			tr, err := Load(r.serviceType, r.botID, taskIdx, taskCopy.UID)
			if err != nil {
				log.Printf("%s load state failed: %v", logPrefix, err)
			}

			uploader := NewUploader(r.apiBase, taskCopy.Webhook, logPrefix, downloadClient, uploadClient)

			w := &Worker{
				logPrefix:     logPrefix,
				client:        srcClient,
				tracker:       tr,
				uploader:      uploader,
				webhookClient: webhookClient,
				apiBase:       r.apiBase,
				webhookURL:    taskCopy.Webhook,
				uid:           taskCopy.UID,
				interval:      time.Duration(taskCopy.Interval) * time.Second,
				sendHistory:   sdk.BoolOrDefault(taskCopy.SendHistoryOnStart, false),
				firstRun:      true,
				freshState:    tr.Fresh(),
				// Max request count in one fetch cycle is 20; add total retry backoff budget,
				// download/upload/webhook timeout budgets (45s/90s/15s).
				fetchTimeout:  time.Duration(30*20)*time.Second + 7088*time.Millisecond + 45*time.Second + 90*time.Second + 15*time.Second,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
