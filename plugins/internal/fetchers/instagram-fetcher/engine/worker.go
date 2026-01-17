package engine

import (
	"context"
	"log"
	"path"
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

type seenTracker interface {
	IsNew(id string) bool
	MarkSeen(id string)
}

func storyDedupKey(story source.StoryItem) string {
	if k := strings.TrimSpace(story.DisplayURLFilename); k != "" {
		return k
	}
	if k := strings.TrimSpace(story.ID); k != "" {
		return k
	}
	return ""
}

func storySeenKeys(story source.StoryItem) []string {
	key := storyDedupKey(story)
	if key == "" {
		return nil
	}
	id := strings.TrimSpace(story.ID)
	if id == "" || id == key {
		return []string{key}
	}
	return []string{key, id}
}

func isStoryNew(tr seenTracker, story source.StoryItem) bool {
	keys := storySeenKeys(story)
	if len(keys) == 0 {
		return false
	}
	for _, k := range keys {
		if !tr.IsNew(k) {
			return false
		}
	}
	return true
}

func markStorySeen(tr seenTracker, story source.StoryItem) {
	for _, k := range storySeenKeys(story) {
		tr.MarkSeen(k)
	}
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
			if storyDedupKey(e) == "" {
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
			ka := storyDedupKey(a)
			kb := storyDedupKey(b)
			if ka != "" && kb != "" && ka != kb {
				return ka < kb
			}
			return a.ID < b.ID
		})

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, e := range edges {
				markStorySeen(w.tracker, e)
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d items", w.logPrefix, len(edges))
			return
		}
		w.firstRun = false

		var newStories []source.StoryItem
		for _, s := range edges {
			if isStoryNew(w.tracker, s) {
				newStories = append(newStories, s)
			}
		}
		if len(newStories) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, s := range newStories {
			if err := w.processAndSend(ctx, user, s); err != nil {
				log.Printf(
					"%s process failed: story_key=%s story_id=%s err=%v",
					w.logPrefix,
					storyDedupKey(s),
					strings.TrimSpace(s.ID),
					err,
				)
				continue
			}
			markStorySeen(w.tracker, s)
		}

		_ = w.tracker.Save()
	})
}

func (w *Worker) processAndSend(ctx context.Context, user *source.UserProfile, story source.StoryItem) error {
	if user == nil {
		return nil
	}

	isVideo := sdk.BoolOrDefault(story.IsVideo, false)
	displayURL := source.DecodeMediaURL(story.DisplayURL)
	thumbURL := source.DecodeMediaURL(story.ThumbnailSrc)
	videoURL := source.DecodeMediaURL(story.VideoURL)

	profilePic := source.DecodeMediaURL(user.ProfilePicURL)
	if strings.TrimSpace(profilePic) == "" {
		profilePic = source.DecodeMediaURL(user.ProfilePicURLHD)
	}

	s3Display := ""
	s3Thumb := ""
	s3Video := ""

	if isVideo {
		if strings.TrimSpace(videoURL) != "" {
			fallback := sdk.FilenameFromURL(videoURL, "video.mp4")
			if ext := path.Ext(fallback); ext == "" {
				fallback = fallback + ".mp4"
			}
			s3Video = w.uploader.UploadWithCache(ctx, videoURL, fallback)
		}
		if strings.TrimSpace(thumbURL) != "" {
			fallback := sdk.FilenameFromURL(thumbURL, "thumbnail.jpg")
			s3Thumb = w.uploader.UploadWithCache(ctx, thumbURL, fallback)
		}
	} else {
		if strings.TrimSpace(displayURL) != "" {
			fallback := strings.TrimSpace(story.DisplayURLFilename)
			if fallback == "" {
				fallback = sdk.FilenameFromURL(displayURL, "story.jpg")
			}
			if ext := path.Ext(fallback); ext == "" {
				fallback = fallback + ".jpg"
			}
			s3Display = w.uploader.UploadWithCache(ctx, displayURL, fallback)
		} else if strings.TrimSpace(thumbURL) != "" {
			fallback := sdk.FilenameFromURL(thumbURL, "story.jpg")
			s3Display = w.uploader.UploadWithCache(ctx, thumbURL, fallback)
		}
	}

	return w.uploader.SendStory(ctx, user, story, UploadResult{
		DisplayKey: s3Display,
		ThumbKey:   s3Thumb,
		VideoKey:   s3Video,
		ProfilePic: profilePic,
		DisplayURL: displayURL,
		ThumbURL:   thumbURL,
		VideoURL:   videoURL,
		IsVideo:    isVideo,
	})
}
