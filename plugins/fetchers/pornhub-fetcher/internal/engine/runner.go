package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/pornhub-fetcher/internal/config"
	"mew/plugins/pornhub-fetcher/internal/source"
	"mew/plugins/sdk"
	"mew/plugins/sdk/x/httpx"
)

type Runner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string

	tasks []config.TaskConfig
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
	group := sdk.NewGroup(ctx)

	phClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:   30 * time.Second,
		Transport: httpx.NewTransport(nil),
	})
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

	src := source.NewClient(phClient, source.DefaultBaseURL)

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		group.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[ph-bot] bot=%s task=%d user=%s", r.botID, taskIndex, taskCopy.Username)

			tr, err := Load(r.serviceType, r.botID, taskIndex, taskCopy.Username, seenCap)
			if err != nil {
				log.Printf("%s load state failed: %v", logPrefix, err)
			}

			uploader := NewUploader(r.apiBase, taskCopy.Webhook, logPrefix, phClient, uploadClient)

			w := &Worker{
				logPrefix:     logPrefix,
				client:        src,
				tracker:       tr,
				uploader:      uploader,
				webhookClient: webhookClient,
				apiBase:       r.apiBase,
				task:          taskCopy,
				firstRun:      true,
				freshState:    tr.Fresh(),
				fetchTimeout:  45 * time.Second,
			}

			w.Run(ctx)
		})
	}

	<-group.Context().Done()
	group.Wait()
	return nil
}
