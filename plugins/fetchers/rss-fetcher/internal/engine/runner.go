package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/rss-fetcher/internal/config"
	"mew/plugins/rss-fetcher/internal/source"
	"mew/plugins/sdk"
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

	rssHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     20 * time.Second,
		UseMEWProxy: true,
	})
	if err != nil {
		return err
	}
	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}

	src := source.NewClient(rssHTTPClient)

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}

		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[rss-fetcher-bot] bot=%s name=%q task=%d", r.botID, r.botName, taskIndex)

			tr, err := Load(r.serviceType, r.botID, taskIndex, taskCopy.RSSURL)
			if err != nil {
				log.Printf("%s failed to load state: %v", logPrefix, err)
			}

			w := &Worker{
				logPrefix:       logPrefix,
				client:          src,
				tracker:         tr,
				uploader:        NewUploader(r.apiBase, taskCopy.Webhook, webhookHTTPClient),
				task:            taskCopy,
				firstRun:        true,
				freshState:      tr.Fresh(),
				fetchTimeout:    25 * time.Second,
				sendHistory:     sdk.BoolOrDefault(taskCopy.SendHistoryOnStart, false),
				interval:        time.Duration(taskCopy.Interval) * time.Second,
				maxItemsPerPoll: taskCopy.MaxItemsPerPoll,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
