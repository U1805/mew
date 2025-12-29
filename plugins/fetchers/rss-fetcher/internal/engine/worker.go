package engine

import (
	"context"
	"log"
	"sort"
	"time"

	"github.com/mmcdole/gofeed"
	"mew/plugins/rss-fetcher/internal/config"
	"mew/plugins/rss-fetcher/internal/source"
	"mew/plugins/sdk"
)

type Worker struct {
	logPrefix string
	client    *source.Client
	tracker   *Manager
	uploader  *Uploader
	task      config.TaskConfig

	firstRun        bool
	freshState      bool
	sendHistory     bool
	interval        time.Duration
	maxItemsPerPoll int
	fetchTimeout    time.Duration
}

func (w *Worker) Run(ctx context.Context) {
	sdk.RunInterval(ctx, w.interval, true, func(ctx context.Context) {
		fetchCtx, cancel := context.WithTimeout(ctx, w.fetchTimeout)
		defer cancel()

		res, err := w.client.Fetch(fetchCtx, w.task.RSSURL, w.tracker.Conditional())
		if err != nil {
			log.Printf("%s fetch failed (rss_url=%s): %v", w.logPrefix, w.task.RSSURL, err)
			return
		}
		if res.NotModified {
			return
		}

		w.tracker.UpdateFetchMeta(res)

		items := res.Items
		if len(items) == 0 {
			_ = w.tracker.Save()
			return
		}

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, it := range items {
				w.tracker.MarkSeen(ItemIdentity(it))
			}
			_ = w.tracker.Save()
			log.Printf("%s initialized (feed=%q items=%d)", w.logPrefix, w.tracker.FeedTitle(res.FeedTitle), len(items))
			w.firstRun = false
			return
		}
		w.firstRun = false

		type datedItem struct {
			it  *gofeed.Item
			t   time.Time
			idx int
		}

		dated := make([]datedItem, 0, len(items))
		for i, it := range items {
			id := ItemIdentity(it)
			if id == "" || !w.tracker.IsNew(id) {
				continue
			}
			dated = append(dated, datedItem{it: it, t: ItemTime(it), idx: i})
		}
		if len(dated) == 0 {
			_ = w.tracker.Save()
			return
		}

		sort.SliceStable(dated, func(i, j int) bool {
			a := dated[i]
			b := dated[j]
			if !a.t.IsZero() && !b.t.IsZero() {
				return a.t.Before(b.t)
			}
			if !a.t.IsZero() && b.t.IsZero() {
				return true
			}
			if a.t.IsZero() && !b.t.IsZero() {
				return false
			}
			return a.idx < b.idx
		})

		if w.maxItemsPerPoll <= 0 {
			w.maxItemsPerPoll = 5
		}
		if len(dated) > w.maxItemsPerPoll {
			dated = dated[len(dated)-w.maxItemsPerPoll:]
		}

		feedTitle := w.tracker.FeedTitle(res.FeedTitle)
		feedImageURL := w.tracker.FeedImageURL()
		feedSiteURL := w.tracker.FeedSiteURL()

		for _, d := range dated {
			it := d.it
			id := ItemIdentity(it)
			w.tracker.MarkSeen(id)

			msg, ok := w.uploader.BuildItemWebhook(feedTitle, feedImageURL, feedSiteURL, w.task.RSSURL, it)
			if !ok {
				continue
			}
			if err := w.uploader.Post(ctx, msg); err != nil {
				log.Printf("%s post failed: %v", w.logPrefix, err)
				continue
			}
		}

		_ = w.tracker.Save()
	})
}
