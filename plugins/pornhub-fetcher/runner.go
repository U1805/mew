package main

import (
	"context"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"mew/plugins/sdk"
)

type PHBotRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	tasks       []PHTaskConfig
}

func NewPHBotRunner(botID, botName, accessToken, rawConfig, apiBase string) (*PHBotRunner, error) {
	tasks, err := parsePHTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &PHBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     apiBase,
		tasks:       tasks,
	}, nil
}

func (r *PHBotRunner) Start() (stop func()) {
	g := sdk.NewGroup(context.Background())

	// 设置一个较长的超时，因为抓取可能较慢
	phClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
	}
	webhookClient := &http.Client{Timeout: 15 * time.Second}
	uploadClient := &http.Client{
		Timeout: 90 * time.Second,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
	}

	for i, task := range r.tasks {
		if task.Enabled != nil && !*task.Enabled {
			continue
		}
		idx := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runTask(ctx, phClient, webhookClient, uploadClient, r.apiBase, r.botID, r.botName, idx, taskCopy)
		})
	}

	return g.Stop
}

func runTask(
	ctx context.Context,
	phClient *http.Client,
	webhookClient *http.Client,
	uploadClient *http.Client,
	apiBase, botID, botName string,
	idx int,
	task PHTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[ph-bot] bot=%s task=%d user=%s", botID, idx, task.Username)

	statePath := taskStateFile(botID, idx, task.Username)
	state, err := loadTaskState(statePath)
	if err != nil {
		log.Printf("%s load state failed: %v", logPrefix, err)
	}

	seen := newSeenSet(1000)
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
				key, err := uploadRemoteFileToWebhook(ctx, phClient, uploadClient, apiBase, task.Webhook, item.ThumbnailURL, "thumbnail.jpg")
				if err != nil {
					log.Printf("%s upload thumbnail failed: %v", logPrefix, err)
				} else {
					s3ThumbKey = key
				}
			}

			s3PreviewKey := ""
			if strings.TrimSpace(item.PreviewURL) != "" {
				key, err := uploadRemoteFileToWebhook(ctx, phClient, uploadClient, apiBase, task.Webhook, item.PreviewURL, "preview.mp4")
				if err != nil {
					log.Printf("%s upload preview failed: %v", logPrefix, err)
				} else {
					s3PreviewKey = key
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
		_ = saveTaskState(statePath, state)
	}

	// 立即执行一次
	work()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			work()
		}
	}
}

func uploadRemoteFileToWebhook(
	ctx context.Context,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, webhookURL, remoteURL, fallbackFilename string,
) (string, error) {
	src := strings.TrimSpace(remoteURL)
	if src == "" {
		return "", nil
	}
	if !strings.HasPrefix(src, "http://") && !strings.HasPrefix(src, "https://") {
		return "", fmt.Errorf("unsupported url: %q", src)
	}

	if downloadClient == nil {
		downloadClient = &http.Client{Timeout: 30 * time.Second}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return "", err
	}
	resp, err := downloadClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download failed: %s", resp.Status)
	}

	filename := filenameFromURL(src, fallbackFilename)
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(filename))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	att, err := sdk.UploadWebhookReader(ctx, uploadClient, apiBase, webhookURL, filename, contentType, resp.Body)
	if err != nil {
		return "", err
	}
	return att.Key, nil
}

func filenameFromURL(rawURL, fallback string) string {
	fb := strings.TrimSpace(fallback)
	if fb == "" {
		fb = "file"
	}
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u == nil {
		return fb
	}
	base := path.Base(u.Path)
	if base == "." || base == "/" || strings.TrimSpace(base) == "" {
		return fb
	}
	return base
}
