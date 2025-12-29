package engine

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"mew/plugins/pornhub-fetcher/internal/config"
	"mew/plugins/pornhub-fetcher/internal/source"
	"mew/plugins/sdk"
)

const (
	cardMessageType = "app/x-pornhub-card"
	seenCap         = 1000
)

type Worker struct {
	logPrefix     string
	client        *source.Client
	tracker       *Manager
	uploader      *Uploader
	webhookClient *http.Client
	apiBase       string

	task config.TaskConfig

	firstRun     bool
	freshState   bool
	fetchTimeout time.Duration
}

func (w *Worker) Run(ctx context.Context) {
	interval := time.Duration(w.task.Interval) * time.Second
	sendHistory := w.task.SendHistoryOnStart != nil && *w.task.SendHistoryOnStart

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) {
		fetchCtx, cancel := context.WithTimeout(ctx, w.fetchTimeout)
		defer cancel()

		body, err := w.client.FetchModelVideosPage(fetchCtx, w.task.Username)
		if err != nil {
			log.Printf("%s fetch failed: %v", w.logPrefix, err)
			return
		}
		defer body.Close()

		author, videos, err := source.ParseModelVideos(body, source.DefaultBaseURL)
		if err != nil {
			log.Printf("%s parse failed: %v", w.logPrefix, err)
			return
		}

		// reverse so we post oldest first
		for i, j := 0, len(videos)-1; i < j; i, j = i+1, j-1 {
			videos[i], videos[j] = videos[j], videos[i]
		}

		if w.firstRun && !sendHistory && w.freshState {
			for _, v := range videos {
				if strings.TrimSpace(v.ID) == "" {
					continue
				}
				w.tracker.MarkSeen(v.ID)
			}
			_ = w.tracker.Save()
			log.Printf("%s init done, cached %d items", w.logPrefix, len(videos))
			w.firstRun = false
			return
		}
		w.firstRun = false

		var newItems []source.Video
		for _, v := range videos {
			if strings.TrimSpace(v.ID) == "" {
				continue
			}
			if w.tracker.IsNew(v.ID) {
				newItems = append(newItems, v)
			}
		}

		for _, item := range newItems {
			if err := w.processAndSend(ctx, author, item); err != nil {
				log.Printf("%s process failed: %v", w.logPrefix, err)
				continue
			}
			w.tracker.MarkSeen(item.ID)
		}

		_ = w.tracker.Save()
	})
}

func (w *Worker) processAndSend(ctx context.Context, author source.Author, item source.Video) error {
	payload := map[string]any{
		"title":         item.Title,
		"url":           item.URL,
		"thumbnail_url": item.ThumbnailURL,
		"preview_url":   item.PreviewURL,
	}

	if strings.TrimSpace(item.ThumbnailURL) != "" {
		if key := w.uploader.UploadThumbnail(ctx, item.ThumbnailURL); key != "" {
			payload["s3_thumbnail_url"] = key
		}
	}
	if strings.TrimSpace(item.PreviewURL) != "" {
		if key := w.uploader.UploadPreview(ctx, item.PreviewURL); key != "" {
			payload["s3_preview_url"] = key
		}
	}

	msg := sdk.WebhookPayload{
		Content:   fmt.Sprintf("@%v posted a new video - %v", author.Name, item.Title),
		Type:      cardMessageType,
		Payload:   payload,
		Username:  author.Name,
		AvatarURL: author.AvatarURL,
	}

	if err := sdk.PostWebhook(ctx, w.webhookClient, w.apiBase, w.task.Webhook, msg, 3); err != nil {
		return err
	}

	log.Printf("%s posted video: %s", w.logPrefix, item.Title)
	return nil
}
