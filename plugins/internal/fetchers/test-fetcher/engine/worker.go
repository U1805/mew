package engine

import (
	"context"
	"log"
	"net/http"
	"time"

	"mew/plugins/pkg"
	"mew/plugins/internal/fetchers/test-fetcher/config"
	"mew/plugins/internal/fetchers/test-fetcher/source"
	"mew/plugins/internal/fetchers/test-fetcher/tracker"
)

type Worker struct {
	logPrefix  string
	client     *source.Client
	tracker    *tracker.Manager
	httpClient *http.Client
	apiBase    string
	task       config.TaskConfig
	interval   time.Duration
}

func (w *Worker) Run(ctx context.Context) {
	sdk.RunInterval(ctx, w.interval, true, func(ctx context.Context) {
		content, err := w.client.Next(ctx, w.task.Content)
		if err != nil {
			log.Printf("%s build message failed: %v", w.logPrefix, err)
			return
		}

		payload := sdk.WebhookPayload{Content: content}
		if err := sdk.PostWebhook(ctx, w.httpClient, w.apiBase, w.task.Webhook, payload, 3); err != nil {
			log.Printf("%s post failed: %v", w.logPrefix, err)
			return
		}

		w.tracker.IncSent()
		_ = w.tracker.Save()
	})
}
