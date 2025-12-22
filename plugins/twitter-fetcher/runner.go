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

type TwitterFetcherRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []TwitterTaskConfig
}

func NewTwitterFetcherRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*TwitterFetcherRunner, error) {
	tasks, err := parseTwitterTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &TwitterFetcherRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *TwitterFetcherRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	twitterClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     25 * time.Second,
		CookieJar:   true,
		UseMEWProxy: true,
	})
	if err != nil {
		return err
	}
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
			runTwitterTask(ctx, twitterClient, webhookClient, downloadClient, uploadClient, r.apiBase, r.serviceType, r.botID, idx, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}

func runTwitterTask(
	ctx context.Context,
	twitterClient *http.Client,
	webhookClient *http.Client,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase string,
	serviceType string,
	botID string,
	idx int,
	task TwitterTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[tw-bot] bot=%s task=%d user=%s", botID, idx, task.Username)

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
	sendHistory := false
	if task.SendHistoryOnStart != nil && *task.SendHistoryOnStart {
		sendHistory = true
	}

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

	uploadWithCache := func(remoteURL, fallbackFilename string) string {
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

	work := func() {
		tl, err := fetchTwitterViewerTimeline(ctx, twitterClient, task.Username)
		if err != nil {
			log.Printf("%s fetch failed: %v", logPrefix, err)
			return
		}

		items := make([]twitterViewerTimelineItem, 0, len(tl.Items))
		for _, it := range tl.Items {
			if it.Type != "tweet" {
				continue
			}
			// Filter out injected tweets: keep only the monitored user's actions.
			if strings.TrimSpace(it.Tweet.UserID) != "" && strings.TrimSpace(tl.MonitoredUser.RestID) != "" {
				if it.Tweet.UserID != tl.MonitoredUser.RestID {
					continue
				}
			}
			if strings.TrimSpace(it.Tweet.RestID) == "" {
				continue
			}
			items = append(items, it)
		}

		type dated struct {
			it twitterViewerTimelineItem
			t  time.Time
			i  int
		}
		datedItems := make([]dated, 0, len(items))
		for i, it := range items {
			datedItems = append(datedItems, dated{it: it, t: tweetCreatedAt(it.Tweet.CreatedAt), i: i})
		}

		// Ensure chronological order (oldest -> newest).
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

		if firstRun && !sendHistory && len(state.Seen) == 0 {
			for _, d := range datedItems {
				seen.Add(d.it.Tweet.RestID)
			}
			state.Seen = seen.Snapshot()
			_ = store.Save(state)
			firstRun = false
			log.Printf("%s init done, cached %d items", logPrefix, len(datedItems))
			return
		}
		firstRun = false

		newOnes := make([]dated, 0, len(datedItems))
		for _, d := range datedItems {
			if !seen.Has(d.it.Tweet.RestID) {
				newOnes = append(newOnes, d)
			}
		}
		if len(newOnes) == 0 {
			return
		}

		buildTweetText := func(t twitterViewerTweet) string {
			text := strings.TrimSpace(t.FullText)
			if text == "" {
				text = strings.TrimSpace(t.DisplayText)
			}
			return text
		}

		buildTweetCardPayload := func(t twitterViewerTweet) map[string]any {
			author := tl.Users[t.UserID]

			tweetURL := buildTweetURL(tl.Users, t.UserID, t.RestID)
			text := buildTweetText(t)

			s3Images := make([]string, 0, len(t.Images))
			for _, img := range t.Images {
				key := uploadWithCache(img, "image"+path.Ext(strings.TrimSpace(img)))
				if key != "" {
					s3Images = append(s3Images, key)
				}
			}

			videoURL, videoCT := pickBestVideoURL(t.Video)
			s3Video := ""
			coverURL := ""
			s3Cover := ""
			if t.Video != nil {
				coverURL = strings.TrimSpace(t.Video.CoverURL)
				if coverURL != "" {
					s3Cover = uploadWithCache(coverURL, "cover"+path.Ext(strings.TrimSpace(coverURL)))
				}
				if strings.TrimSpace(videoURL) != "" {
					s3Video = uploadWithCache(videoURL, "video.mp4")
				}
			}

			out := map[string]any{
				"id":            t.RestID,
				"url":           tweetURL,
				"text":          text,
				"created_at":    t.CreatedAt,
				"author_name":   author.Name,
				"author_handle": author.Handle,
				"author_avatar": author.ProfileImageURL,
				"images":        t.Images,
				"video_url":     videoURL,
				"cover_url":     coverURL,
				"like_count":    t.FavoriteCount,
				"retweet_count": t.RetweetCount,
				"reply_count":   t.ReplyCount,
				"quote_count":   t.QuoteCount,
				"view_count":    safeInt64ToString(t.ViewCount),
			}
			if len(s3Images) > 0 {
				out["s3_images"] = s3Images
			}
			if s3Cover != "" {
				out["s3_cover_url"] = s3Cover
			}
			if s3Video != "" {
				out["s3_video_url"] = s3Video
				out["video_content_type"] = videoCT
			}
			return out
		}

		for _, d := range newOnes {
			wrapper := d.it.Tweet
			seen.Add(wrapper.RestID)

			display := wrapper
			isRetweet := false
			if wrapper.RetweetedTweet != nil && strings.TrimSpace(wrapper.RetweetedTweet.RestID) != "" {
				display = *wrapper.RetweetedTweet
				isRetweet = true
			}

			author := tl.Users[display.UserID]
			if strings.TrimSpace(author.Handle) == "" {
				author = tl.Users[wrapper.UserID]
			}

			tweetURL := buildTweetURL(tl.Users, display.UserID, display.RestID)
			if tweetURL == "" {
				tweetURL = buildTweetURL(tl.Users, wrapper.UserID, wrapper.RestID)
			}

			text := buildTweetText(display)

			s3Images := make([]string, 0, len(display.Images))
			for _, img := range display.Images {
				key := uploadWithCache(img, "image"+path.Ext(strings.TrimSpace(img)))
				if key != "" {
					s3Images = append(s3Images, key)
				}
			}

			videoURL, videoCT := pickBestVideoURL(display.Video)
			s3Video := ""
			coverURL := ""
			s3Cover := ""
			if display.Video != nil {
				coverURL = strings.TrimSpace(display.Video.CoverURL)
				if coverURL != "" {
					s3Cover = uploadWithCache(coverURL, "cover"+path.Ext(strings.TrimSpace(coverURL)))
				}
				if strings.TrimSpace(videoURL) != "" {
					s3Video = uploadWithCache(videoURL, "video.mp4")
				}
			}

			payload := map[string]any{
				"id":            wrapper.RestID,
				"url":           tweetURL,
				"text":          text,
				"created_at":    display.CreatedAt,
				"is_retweet":    isRetweet,
				"author_name":   author.Name,
				"author_handle": author.Handle,
				"author_avatar": author.ProfileImageURL,
				"images":        display.Images,
				"video_url":     videoURL,
				"cover_url":     coverURL,
				"like_count":    display.FavoriteCount,
				"retweet_count": display.RetweetCount,
				"reply_count":   display.ReplyCount,
				"quote_count":   display.QuoteCount,
				"view_count":    safeInt64ToString(display.ViewCount),
			}
			if len(s3Images) > 0 {
				payload["s3_images"] = s3Images
			}
			if s3Cover != "" {
				payload["s3_cover_url"] = s3Cover
			}
			if s3Video != "" {
				payload["s3_video_url"] = s3Video
				payload["video_content_type"] = videoCT
			}
			if display.QuotedTweet != nil && strings.TrimSpace(display.QuotedTweet.RestID) != "" {
				payload["quoted_tweet"] = buildTweetCardPayload(*display.QuotedTweet)
			}

			content := text
			if isRetweet && strings.TrimSpace(author.Handle) != "" {
				content = fmt.Sprintf("RT @%s: %s", author.Handle, text)
			}
			if len([]rune(content)) > 180 {
				content = string([]rune(content)[:180]) + "…"
			}

			msg := sdk.WebhookPayload{
				Content:   content,
				Type:      "app/x-twitter-card",
				Payload:   payload,
				Username:  tl.MonitoredUser.Name,
				AvatarURL: tl.MonitoredUser.ProfileImageURL,
			}
			if err := sdk.PostWebhook(ctx, webhookClient, apiBase, task.Webhook, msg, 3); err != nil {
				log.Printf("%s post webhook failed: %v", logPrefix, err)
				continue
			}
			log.Printf("%s posted: %s", logPrefix, tweetURL)
		}

		state.Seen = seen.Snapshot()
		_ = store.Save(state)
	}

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { work() })
}