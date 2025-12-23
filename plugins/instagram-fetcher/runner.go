package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"mew/plugins/sdk"
)

type taskState struct {
	Seen       []string          `json:"seen,omitempty"`
	MediaCache map[string]string `json:"media_cache,omitempty"`
	MediaOrder []string          `json:"media_order,omitempty"`
}

type InstagramFetcherRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []InstagramTaskConfig
}

func NewInstagramFetcherRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*InstagramFetcherRunner, error) {
	tasks, err := parseInstagramTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &InstagramFetcherRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *InstagramFetcherRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	webhookClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}
	downloadClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     45 * time.Second,
		UseMEWProxy: true,
	})
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
			runInstagramTask(ctx, webhookClient, downloadClient, uploadClient, r.apiBase, r.serviceType, r.botID, r.botName, idx, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}

func runInstagramTask(
	ctx context.Context,
	webhookClient *http.Client,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, serviceType, botID, botName string,
	idx int,
	task InstagramTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[ig-bot] bot=%s task=%d user=%s", botID, idx, task.Username)

	igClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     35 * time.Second,
		CookieJar:   true,
		UseMEWProxy: true,
	})
	if err != nil {
		log.Printf("%s init http client failed: %v", logPrefix, err)
		return
	}

	store := sdk.OpenTaskState[taskState](serviceType, botID, idx, task.Username)
	state, err := store.Load()
	if err != nil {
		log.Printf("%s load state failed: %v", logPrefix, err)
	}
	if state.MediaCache == nil {
		state.MediaCache = map[string]string{}
	}

	seen := sdk.NewSeenSet(2000)
	for _, id := range state.Seen {
		seen.Add(id)
	}

	firstRun := true
	sendHistory := sdk.BoolOrDefault(task.SendHistoryOnStart, false)

	mediaCachePut := func(remoteURL, key string) {
		remoteURL = strings.TrimSpace(remoteURL)
		key = strings.TrimSpace(key)
		if remoteURL == "" || key == "" {
			return
		}
		if _, ok := state.MediaCache[remoteURL]; ok {
			return
		}
		state.MediaCache[remoteURL] = key
		state.MediaOrder = append(state.MediaOrder, remoteURL)

		const max = 200
		if len(state.MediaOrder) <= max {
			return
		}
		overflow := len(state.MediaOrder) - max
		for i := 0; i < overflow; i++ {
			delete(state.MediaCache, state.MediaOrder[i])
		}
		state.MediaOrder = append([]string(nil), state.MediaOrder[overflow:]...)
	}

	uploadWithCache := func(ctx context.Context, remoteURL, fallbackFilename string) string {
		src := strings.TrimSpace(remoteURL)
		if src == "" {
			return ""
		}
		if key, ok := state.MediaCache[src]; ok && strings.TrimSpace(key) != "" {
			return key
		}
		att, err := sdk.UploadRemoteToWebhook(ctx, downloadClient, uploadClient, apiBase, task.Webhook, src, fallbackFilename)
		if err != nil {
			log.Printf("%s upload media failed: url=%s err=%v", logPrefix, src, err)
			return ""
		}
		mediaCachePut(src, att.Key)
		return att.Key
	}

	work := func(tickCtx context.Context) {
		fetchCtx, cancel := context.WithTimeout(tickCtx, 50*time.Second)
		defer cancel()

		user, err := fetchInstagramUser(fetchCtx, igClient, task.Username)
		if err != nil {
			log.Printf("%s fetch failed: %v", logPrefix, err)
			return
		}

		edges := make([]igEdge, 0, len(user.Edges))
		for _, e := range user.Edges {
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

		if firstRun && !sendHistory && len(state.Seen) == 0 {
			for _, e := range edges {
				seen.Add(e.ID)
			}
			state.Seen = seen.Snapshot()
			_ = store.Save(state)
			firstRun = false
			log.Printf("%s init done, cached %d items", logPrefix, len(edges))
			return
		}
		firstRun = false

		newOnes := make([]igEdge, 0)
		for _, e := range edges {
			if !seen.Has(e.ID) {
				newOnes = append(newOnes, e)
			}
		}
		if len(newOnes) == 0 {
			return
		}

		profilePic := iqSavedDecodeURL(user.ProfilePicURL)
		if strings.TrimSpace(profilePic) == "" {
			profilePic = iqSavedDecodeURL(user.ProfilePicURLHD)
		}

		for _, e := range newOnes {
			seen.Add(e.ID)

			isVideo := sdk.BoolOrDefault(e.IsVideo, false)
			displayURL := iqSavedDecodeURL(e.DisplayURL)
			thumbURL := iqSavedDecodeURL(e.ThumbnailSrc)
			videoURL := iqSavedDecodeURL(e.VideoURL)

			s3Display := ""
			s3Thumb := ""
			s3Video := ""
			if isVideo {
				if strings.TrimSpace(videoURL) != "" {
					fallback := sdk.FilenameFromURL(videoURL, "video.mp4")
					if ext := path.Ext(fallback); ext == "" {
						fallback = fallback + ".mp4"
					}
					s3Video = uploadWithCache(tickCtx, videoURL, fallback)
				}
				if strings.TrimSpace(thumbURL) != "" {
					fallback := sdk.FilenameFromURL(thumbURL, "thumbnail.jpg")
					s3Thumb = uploadWithCache(tickCtx, thumbURL, fallback)
				}
			} else {
				if strings.TrimSpace(displayURL) != "" {
					fallback := strings.TrimSpace(e.DisplayURLFilename)
					if fallback == "" {
						fallback = sdk.FilenameFromURL(displayURL, "story.jpg")
					}
					if ext := path.Ext(fallback); ext == "" {
						fallback = fallback + ".jpg"
					}
					s3Display = uploadWithCache(tickCtx, displayURL, fallback)
				} else if strings.TrimSpace(thumbURL) != "" {
					fallback := sdk.FilenameFromURL(thumbURL, "story.jpg")
					s3Display = uploadWithCache(tickCtx, thumbURL, fallback)
				}
			}

			payload := map[string]any{
				"id":            e.ID,
				"taken_at":      e.TakenAt,
				"is_video":      isVideo,
				"like_count":    e.LikeCount,
				"comment_count": e.CommentCount,

				"display_url":          displayURL,
				"display_url_filename": strings.TrimSpace(e.DisplayURLFilename),
				"thumbnail_src":        thumbURL,
				"video_url":            videoURL,

				"user_id":          user.ID,
				"username":         user.Username,
				"full_name":        user.FullName,
				"biography":        user.Biography,
				"profile_pic_url":  profilePic,
				"followers_count":  user.EdgeFollowedBy,
				"following_count":  user.EdgeFollow,
				"is_verified":      user.IsVerified,
				"is_private":       user.IsPrivate,
				"external_url":     user.ExternalURL,
				"category_name":    user.CategoryName,
				"business_category": user.BusinessCategoryName,
			}
			if s3Display != "" {
				payload["s3_display_url"] = s3Display
			}
			if s3Thumb != "" {
				payload["s3_thumbnail_url"] = s3Thumb
			}
			if s3Video != "" {
				payload["s3_video_url"] = s3Video
			}

			content := fmt.Sprintf("@%s posted a new story", strings.TrimSpace(user.Username))
			msg := sdk.WebhookPayload{
				Content:   content,
				Type:      "app/x-instagram-card",
				Payload:   payload,
				Username:  strings.TrimSpace(user.FullName),
				AvatarURL: profilePic,
			}

			if strings.TrimSpace(msg.Username) == "" {
				msg.Username = "@"+strings.TrimSpace(user.Username)
			}

			if err := sdk.PostWebhook(tickCtx, webhookClient, apiBase, task.Webhook, msg, 3); err != nil {
				log.Printf("%s post failed: %v", logPrefix, err)
			} else {
				log.Printf("%s posted story: id=%s", logPrefix, e.ID)
			}
		}

		state.Seen = seen.Snapshot()
		_ = store.Save(state)
	}

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { work(ctx) })
}
