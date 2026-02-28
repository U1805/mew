package engine

import (
	"context"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"mew/plugins/internal/fetchers/twitter-fetcher/source"
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

		tl, err := w.client.FetchTimeline(fetchCtx, w.username)
		if err != nil {
			log.Printf("%s fetch failed: %v", w.logPrefix, err)
			return
		}

		items := make([]source.TimelineItem, 0, len(tl.Items))
		monitoredHandle := normalizedHandle(tl.MonitoredUser.Handle)
		if monitoredHandle == "" {
			monitoredHandle = normalizedHandle(w.username)
		}
		for _, it := range tl.Items {
			if it.Type != "tweet" {
				continue
			}
			tweetHandle := normalizedHandle(tweetAuthorHandle(tl, it.Tweet))
			if monitoredHandle != "" && tweetHandle != "" && tweetHandle != monitoredHandle {
				continue
			}
			if monitoredHandle != "" && tweetHandle == "" {
				if strings.TrimSpace(it.Tweet.UserID) != "" {
					continue
				}
			}
			if strings.TrimSpace(it.Tweet.RestID) == "" {
				continue
			}
			items = append(items, it)
		}

		type dated struct {
			it source.TimelineItem
			t  time.Time
			i  int
		}
		datedItems := make([]dated, 0, len(items))
		for i, it := range items {
			datedItems = append(datedItems, dated{it: it, t: TweetCreatedAt(it.Tweet.CreatedAt), i: i})
		}

		sort.SliceStable(datedItems, func(i, j int) bool {
			a := datedItems[i]
			b := datedItems[j]
			if !a.t.IsZero() && !b.t.IsZero() {
				return a.t.Before(b.t)
			}
			if !a.t.IsZero() && b.t.IsZero() {
				return true
			}
			if a.t.IsZero() && !b.t.IsZero() {
				return false
			}
			return a.i < b.i
		})

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, d := range datedItems {
				w.tracker.MarkSeen(d.it.Tweet.RestID)
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d items", w.logPrefix, len(datedItems))
			return
		}
		w.firstRun = false

		newOnes := make([]dated, 0)
		for _, d := range datedItems {
			if w.tracker.IsNew(d.it.Tweet.RestID) {
				newOnes = append(newOnes, d)
			}
		}
		if len(newOnes) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, d := range newOnes {
			if err := w.uploader.SendTweet(ctx, tl, d.it.Tweet); err != nil {
				log.Printf("%s post webhook failed: %v", w.logPrefix, err)
				continue
			}
			w.tracker.MarkSeen(d.it.Tweet.RestID)
		}

		_ = w.tracker.Save()
	})
}

func tweetAuthorHandle(tl source.Timeline, tw source.Tweet) string {
	uid := strings.TrimSpace(tw.UserID)
	if uid == "" {
		return ""
	}
	if usr, ok := tl.Users[uid]; ok && strings.TrimSpace(usr.Handle) != "" {
		return usr.Handle
	}
	if _, err := strconv.ParseInt(uid, 10, 64); err == nil {
		return ""
	}
	return uid
}

func normalizedHandle(v string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(v, "@")))
}
