package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/internal/fetchers/bilibili-fetcher/config"
	"mew/plugins/internal/fetchers/bilibili-fetcher/source"
	"mew/plugins/pkg"
	"mew/plugins/pkg/x/httpx"
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

	biliHTTP, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 20 * time.Second, Transport: httpx.NewTransport(nil)})
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

			uploader := NewUploader(r.apiBase, taskCopy.Webhook, logPrefix, biliHTTP, uploadClient)

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
				fetchTimeout:  25 * time.Second,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
