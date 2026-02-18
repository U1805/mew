package engine

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
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

		stories, user, err := w.client.FetchStories(fetchCtx, w.username)
		if err != nil {
			log.Printf("%s fetch failed: %v", w.logPrefix, err)
			return
		}

		edges := make([]source.StoryItem, 0, len(stories))
		for _, e := range stories {
			if strings.TrimSpace(e.ID) == "" {
				continue
			}
			edges = append(edges, e)
		}

		sort.SliceStable(edges, func(i, j int) bool {
			a := edges[i]
			b := edges[j]
			if a.TakenAt != 0 && b.TakenAt != 0 {
				return a.TakenAt < b.TakenAt
			}
			if a.TakenAt != 0 && b.TakenAt == 0 {
				return true
			}
			if a.TakenAt == 0 && b.TakenAt != 0 {
				return false
			}
			ka := strings.TrimSpace(a.ID)
			kb := strings.TrimSpace(b.ID)
			if ka != "" && kb != "" && ka != kb {
				return ka < kb
			}
			return a.ID < b.ID
		})

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, e := range edges {
				w.tracker.MarkSeen(strings.TrimSpace(e.ID))
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d items", w.logPrefix, len(edges))
			return
		}
		w.firstRun = false

		var newStories []source.StoryItem
		for _, s := range edges {
			if w.tracker.IsNew(strings.TrimSpace(s.ID)) {
				newStories = append(newStories, s)
			}
		}
		if len(newStories) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, s := range newStories {
			if err := w.uploader.ProcessAndSendStory(ctx, user, s); err != nil {
				log.Printf(
					"%s process failed: story_key=%s story_id=%s err=%v",
					w.logPrefix,
					strings.TrimSpace(s.ID),
					strings.TrimSpace(s.ID),
					err,
				)
				continue
			}
			w.tracker.MarkSeen(strings.TrimSpace(s.ID))
		}

		_ = w.tracker.Save()
	})
}
