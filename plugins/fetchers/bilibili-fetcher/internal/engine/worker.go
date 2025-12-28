package engine

import (
	"context"
	"log"
	"net/http"
	"time"

	"mew/plugins/bilibili-fetcher/internal/source"
	"mew/plugins/sdk"
)

type Worker struct {
	logPrefix     string
	client        *source.Client
	tracker       *Manager
	uploader      *Uploader
	webhookClient *http.Client
	apiBase       string
	webhookURL    string

	uid          string
	interval     time.Duration
	sendHistory  bool
	firstRun     bool
	freshState   bool
	fetchTimeout time.Duration
}

func (w *Worker) Run(ctx context.Context) {
	sdk.RunInterval(ctx, w.interval, true, func(ctx context.Context) {
		fetchCtx, cancel := context.WithTimeout(ctx, w.fetchTimeout)
		defer cancel()

		items, err := w.client.FetchDynamics(fetchCtx, w.uid)
		if err != nil {
			log.Printf("%s fetch failed: %v", w.logPrefix, err)
			return
		}

		// reverse so we post oldest first
		for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
			items[i], items[j] = items[j], items[i]
		}

		newItems := make([]source.APIItem, 0)

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, item := range items {
				w.tracker.MarkSeen(item.IDStr)
			}
			_ = w.tracker.Save()
			log.Printf("%s init done, cached %d items (send_history_on_start=false, skipping history)", w.logPrefix, len(items))
			w.firstRun = false
			return
		}

		if w.firstRun && w.sendHistory && !w.freshState {
			log.Printf("%s send_history_on_start=true but state already has seen items; history will NOT be resent unless you clear state", w.logPrefix)
		}

		for _, item := range items {
			if item.IDStr != "" && w.tracker.IsNew(item.IDStr) {
				newItems = append(newItems, item)
			}
		}
		w.firstRun = false

		if len(newItems) == 0 {
			_ = w.tracker.Save()
			return
		}
		log.Printf("%s found %d new items", w.logPrefix, len(newItems))

		for _, item := range newItems {
			msg, err := w.uploader.BuildWebhook(ctx, item)
			if err != nil {
				log.Printf("%s transform item %s failed: %v", w.logPrefix, item.IDStr, err)
				continue
			}

			if err := sdk.PostWebhook(ctx, w.webhookClient, w.apiBase, w.webhookURL, *msg, 3); err != nil {
				log.Printf("%s post webhook failed: %v", w.logPrefix, err)
				continue
			}

			w.tracker.MarkSeen(item.IDStr)
			log.Printf("%s posted dynamic: %s", w.logPrefix, item.IDStr)
		}

		_ = w.tracker.Save()
	})
}
