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
			if strings.TrimSpace(e.ID) == "" && e.TakenAt <= 0 {
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
			for _, s := range edges {
				markStoryPostSeen(w.tracker, s)
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d posts", w.logPrefix, len(edges))
			return
		}
		w.firstRun = false

		var newPosts []source.StoryItem
		for _, s := range edges {
			if isStoryPostNew(w.tracker, s) {
				newPosts = append(newPosts, s)
			}
		}
		if len(newPosts) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, s := range newPosts {
			if err := w.uploader.ProcessAndSendPost(ctx, user, strings.TrimSpace(s.ID), storyPostItems(s)); err != nil {
				log.Printf(
					"%s process failed: post_id=%s err=%v",
					w.logPrefix,
					strings.TrimSpace(s.ID),
					err,
				)
				continue
			}
			markStoryPostSeen(w.tracker, s)
		}

		_ = w.tracker.Save()
	})
}

func isStoryPostNew(m *Manager, story source.StoryItem) bool {
	if m == nil {
		return false
	}
	postID := strings.TrimSpace(story.ID)
	if !m.IsNew(postID) {
		return false
	}
	// Backward compatibility: old state may only contain story-level ids.
	for _, s := range storyPostItems(story) {
		id := strings.TrimSpace(s.ID)
		if id == "" {
			continue
		}
		if !m.IsNew(id) {
			return false
		}
	}
	return true
}

func markStoryPostSeen(m *Manager, story source.StoryItem) {
	if m == nil {
		return
	}
	postID := strings.TrimSpace(story.ID)
	if postID != "" {
		m.MarkSeen(postID)
	}
	// Keep story-level ids for compatibility with previous versions and rollback safety.
	for _, s := range storyPostItems(story) {
		id := strings.TrimSpace(s.ID)
		if id == "" {
			continue
		}
		m.MarkSeen(id)
	}
}

func storyPostItems(story source.StoryItem) []source.StoryItem {
	if len(story.Items) > 0 {
		return story.Items
	}
	return []source.StoryItem{story}
}
