package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/pkg"
	"mew/plugins/internal/fetchers/twitter-fetcher/config"
	"mew/plugins/internal/fetchers/twitter-fetcher/source"
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

	twitterClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:   25 * time.Second,
		CookieJar: true,
		Transport: httpx.NewTransport(nil),
	})
	if err != nil {
		return err
	}
	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}
	downloadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:   45 * time.Second,
		Transport: httpx.NewTransport(nil),
	})
	if err != nil {
		return err
	}
	uploadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 90 * time.Second})
	if err != nil {
		return err
	}

	src := source.NewClient(twitterClient)

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}

		idx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[tw-bot] bot=%s task=%d user=%s", r.botID, idx, taskCopy.Username)

			tr, err := Load(r.serviceType, r.botID, idx, taskCopy.Username)
			if err != nil {
				log.Printf("%s load state failed: %v", logPrefix, err)
			}

			uploader := NewUploader(r.apiBase, taskCopy.Webhook, logPrefix, webhookClient, downloadClient, uploadClient, tr)

			w := &Worker{
				logPrefix:    logPrefix,
				client:       src,
				tracker:      tr,
				uploader:     uploader,
				username:     taskCopy.Username,
				interval:     time.Duration(taskCopy.Interval) * time.Second,
				sendHistory:  sdk.BoolOrDefault(taskCopy.SendHistoryOnStart, false),
				firstRun:     true,
				freshState:   tr.Fresh(),
				fetchTimeout: 35 * time.Second,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
