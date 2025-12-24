package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"mew/plugins/sdk"
)

type taskState struct {
	Seen []string `json:"seen,omitempty"`
}

type PHBotRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []PHTaskConfig
}

func NewPHBotRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*PHBotRunner, error) {
	tasks, err := parsePHTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &PHBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *PHBotRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	phClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     30 * time.Second,
		UseMEWProxy: true,
	})
	if err != nil {
		return err
	}
	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}
	uploadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 90 * time.Second})
	if err != nil {
		return err
	}

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		idx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runTask(ctx, phClient, webhookClient, uploadClient, r.apiBase, r.serviceType, r.botID, r.botName, idx, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}

func runTask(
	ctx context.Context,
	phClient *http.Client,
	webhookClient *http.Client,
	uploadClient *http.Client,
	apiBase, serviceType, botID, botName string,
	idx int,
	task PHTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[ph-bot] bot=%s task=%d user=%s", botID, idx, task.Username)

	store := sdk.OpenTaskState[taskState](serviceType, botID, idx, task.Username)
	state, err := store.Load()
	if err != nil {
		log.Printf("%s load state failed: %v", logPrefix, err)
	}

	seen := sdk.NewSeenSet(1000)
	for _, id := range state.Seen {
		seen.Add(id)
	}

	firstRun := true
	sendHistory := false
	if task.SendHistoryOnStart != nil && *task.SendHistoryOnStart {
		sendHistory = true
	}

	work := func() {
		author, videos, err := fetchPHVideos(ctx, phClient, task.Username)
		if err != nil {
			log.Printf("%s fetch failed: %v", logPrefix, err)
			return
		}

		// 反转视频列表，确保从最旧的新视频开始处理 (Python logic: videos_list[::-1])
		// 这样发布顺序才是正确的
		for i, j := 0, len(videos)-1; i < j; i, j = i+1, j-1 {
			videos[i], videos[j] = videos[j], videos[i]
		}

		newItems := make([]PHVideoItem, 0)

		// 第一次运行且不发送历史，只记录 ID 到 seen
		if firstRun && !sendHistory && len(state.Seen) == 0 {
			for _, v := range videos {
				seen.Add(v.ID)
			}
			log.Printf("%s init done, cached %d items", logPrefix, len(videos))
		} else {
			// 筛选新视频
			for _, v := range videos {
				if v.ID == "" {
					continue
				}
				if !seen.Has(v.ID) {
					newItems = append(newItems, v)
				}
			}
		}

		firstRun = false

		for _, item := range newItems {
			seen.Add(item.ID)

			s3ThumbKey := ""
			if strings.TrimSpace(item.ThumbnailURL) != "" {
				att, err := sdk.UploadRemoteToWebhook(ctx, phClient, uploadClient, apiBase, task.Webhook, item.ThumbnailURL, "thumbnail.jpg")
				if err != nil {
					log.Printf("%s upload thumbnail failed: %v", logPrefix, err)
				} else {
					s3ThumbKey = att.Key
				}
			}

			s3PreviewKey := ""
			if strings.TrimSpace(item.PreviewURL) != "" {
				att, err := sdk.UploadRemoteToWebhook(ctx, phClient, uploadClient, apiBase, task.Webhook, item.PreviewURL, "preview.mp4")
				if err != nil {
					log.Printf("%s upload preview failed: %v", logPrefix, err)
				} else {
					s3PreviewKey = att.Key
				}
			}

			customPayload := map[string]any{
				"title":         item.Title,
				"url":           item.URL,
				"thumbnail_url": item.ThumbnailURL,
				"preview_url":   item.PreviewURL,
			}
			if s3ThumbKey != "" {
				customPayload["s3_thumbnail_url"] = s3ThumbKey
			}
			if s3PreviewKey != "" {
				customPayload["s3_preview_url"] = s3PreviewKey
			}

			msg := sdk.WebhookPayload{
				Content:   item.Title,
				Type:      "app/x-pornhub-card",
				Payload:   customPayload,
				Username:  author.Name,
				AvatarURL: author.AvatarURL,
			}

			if err := sdk.PostWebhook(ctx, webhookClient, apiBase, task.Webhook, msg, 3); err != nil {
				log.Printf("%s post webhook failed: %v", logPrefix, err)
			} else {
				log.Printf("%s posted video: %s", logPrefix, item.Title)
			}
		}

		// 保存状态
		state.Seen = seen.Snapshot()
		_ = store.Save(state)
	}

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { work() })
}
