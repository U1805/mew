package engine

import (
	"context"
	"fmt"
	"log"
	"time"

	"mew/plugins/internal/fetchers/instagram-fetcher/config"
	"mew/plugins/internal/fetchers/instagram-fetcher/source"
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

	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 15 * time.Second,
		Mode:    "direct",
	})
	if err != nil {
		return err
	}
	downloadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 45 * time.Second,
		Mode:    "proxy",
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

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}

		taskIdx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			logPrefix := fmt.Sprintf("[ig-bot] bot=%s task=%d user=%s", r.botID, taskIdx, taskCopy.Username)

			client, err := source.NewClient(true)
			if err != nil {
				log.Printf("%s init source client failed: %v", logPrefix, err)
				return
			}

			tr, err := Load(r.serviceType, r.botID, taskIdx, taskCopy.Username)
			if err != nil {
				log.Printf("%s load state failed: %v", logPrefix, err)
			}

			uploader := NewUploader(r.apiBase, taskCopy.Webhook, logPrefix, webhookClient, downloadClient, uploadClient, tr)

			w := &Worker{
				logPrefix:    logPrefix,
				client:       client,
				tracker:      tr,
				uploader:     uploader,
				username:     taskCopy.Username,
				interval:     time.Duration(taskCopy.Interval) * time.Second,
				sendHistory:  sdk.BoolOrDefault(taskCopy.SendHistoryOnStart, false),
				firstRun:     true,
				freshState:   tr.Fresh(),
				// Max request count in one fetch cycle is 19; add webhook/download/upload timeout budgets.
				fetchTimeout: time.Duration(30*19)*time.Second + 15*time.Second + 45*time.Second + 90*time.Second,
			}

			w.Run(ctx)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
