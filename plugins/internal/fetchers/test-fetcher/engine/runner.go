package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/internal/fetchers/test-fetcher/config"
	"mew/plugins/internal/fetchers/test-fetcher/source"
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

	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 15 * time.Second,
		Mode:    "direct",
	})
	if err != nil {
		return err
	}

	src := source.NewClient()

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}

		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[test-bot] bot=%s name=%q task=%d", r.botID, r.botName, taskIndex)

			tr, err := Load(r.serviceType, r.botID, taskIndex, taskCopy.Webhook)
			if err != nil {
				log.Printf("%s load state failed: %v", logPrefix, err)
			}

			w := &Worker{
				logPrefix:  logPrefix,
				client:     src,
				tracker:    tr,
				httpClient: webhookHTTPClient,
				apiBase:    r.apiBase,
				task:       taskCopy,
				interval:   time.Duration(taskCopy.Interval) * time.Second,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
