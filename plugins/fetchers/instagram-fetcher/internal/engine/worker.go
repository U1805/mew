package engine

import (
	"context"
	"log"
	"path"
	"sort"
	"strings"
	"time"

	"mew/plugins/instagram-fetcher/internal/source"
	"mew/plugins/sdk"
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
			return a.ID < b.ID
		})

		if w.firstRun && !w.sendHistory && w.freshState {
			for _, e := range edges {
				w.tracker.MarkSeen(e.ID)
			}
			_ = w.tracker.Save()
			w.firstRun = false
			log.Printf("%s init done, cached %d items", w.logPrefix, len(edges))
			return
		}
		w.firstRun = false

		var newStories []source.StoryItem
		for _, s := range edges {
			if w.tracker.IsNew(s.ID) {
				newStories = append(newStories, s)
			}
		}
		if len(newStories) == 0 {
			_ = w.tracker.Save()
			return
		}

		for _, s := range newStories {
			if err := w.processAndSend(ctx, user, s); err != nil {
				log.Printf("%s process failed: story=%s err=%v", w.logPrefix, strings.TrimSpace(s.ID), err)
				continue
			}
			w.tracker.MarkSeen(s.ID)
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
