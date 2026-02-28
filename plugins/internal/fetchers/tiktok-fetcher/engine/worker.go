package engine

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"mew/plugins/internal/fetchers/tiktok-fetcher/source"
	"mew/plugins/pkg"
)

type Worker struct {
	logPrefix    string
	client       *source.Client
	tracker      *Manager
	uploader     *Uploader
	username     string
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

		feed, err := w.client.FetchFeed(fetchCtx, w.username)
		if err != nil {
			log.Printf("%s fetch failed: %v", w.logPrefix, err)
			return
		}

		items := make([]source.Video, 0, len(feed.Videos))
		for _, v := range feed.Videos {
			if strings.TrimSpace(v.ID) == "" {
				continue
			}
			items = append(items, v)
		}

		sort.SliceStable(items, func(i, j int) bool {
			at := source.ParseVideoTime(items[i].UploadDate)
			bt := source.ParseVideoTime(items[j].UploadDate)
			if !at.IsZero() && !bt.IsZero() {
				return at.Before(bt)
			}
			if !at.IsZero() && bt.IsZero() {
				return true
			}
			if at.IsZero() && !bt.IsZero() {
				return false
			}
			return strings.TrimSpace(items[i].ID) < strings.TrimSpace(items[j].ID)
		})

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, v := range items {
				w.tracker.MarkSeen(v.ID)
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d videos", w.logPrefix, len(items))
			return
		}
		w.firstRun = false

		newOnes := make([]source.Video, 0)
		for _, v := range items {
			if w.tracker.IsNew(v.ID) {
				newOnes = append(newOnes, v)
			}
		}
		if len(newOnes) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, v := range newOnes {
			if err := w.uploader.SendVideo(ctx, feed, v); err != nil {
				log.Printf("%s post webhook failed: %v", w.logPrefix, err)
				continue
			}
			w.tracker.MarkSeen(v.ID)
		}
		_ = w.tracker.Save()
	})
}
