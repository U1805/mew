package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
	"mew/plugins/sdk"
)

type taskState struct {
	ETag         string   `json:"etag,omitempty"`
	LastModified string   `json:"last_modified,omitempty"`
	FeedTitle    string   `json:"feed_title,omitempty"`
	FeedImageURL string   `json:"feed_image_url,omitempty"`
	FeedSiteURL  string   `json:"feed_site_url,omitempty"`
	Seen         []string `json:"seen,omitempty"`
}

type RSSFetcherBotRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []RSSFetchTaskConfig
}

func NewRSSFetcherBotRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*RSSFetcherBotRunner, error) {
	tasks, err := parseRSSTasks(rawConfig)
	if err != nil {
		return nil, err
	}

	return &RSSFetcherBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *RSSFetcherBotRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	rssHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     20 * time.Second,
		UseMEWProxy: true,
	})
	if err != nil {
		return err
	}
	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: 15 * time.Second,
	})
	if err != nil {
		return err
	}

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runRSSTask(ctx, rssHTTPClient, webhookHTTPClient, r.apiBase, r.serviceType, r.botID, r.botName, taskIndex, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}

func runRSSTask(
	ctx context.Context,
	rssHTTPClient *http.Client,
	webhookHTTPClient *http.Client,
	apiBase string,
	serviceType string,
	botID, botName string,
	idx int,
	task RSSFetchTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[rss-fetcher-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	parser := gofeed.NewParser()

	store := sdk.OpenTaskState[taskState](serviceType, botID, idx, task.RSSURL)
	state, err := store.Load()
	if err != nil {
		log.Printf("%s failed to load state: %v", logPrefix, err)
	}

	seen := sdk.NewSeenSet(1000)
	for _, id := range state.Seen {
		seen.Add(id)
	}

	first := true
	sendHistoryOnStart := sdk.BoolOrDefault(task.SendHistoryOnStart, false)

	fetchAndPost := func() {
		items, feedTitle, feedImageURL, feedSiteURL, notModified, err := fetchRSS(ctx, rssHTTPClient, parser, task.RSSURL, &state)
		if err != nil {
			log.Printf("%s fetch failed (rss_url=%s): %v", logPrefix, task.RSSURL, err)
			return
		}
		if notModified {
			return
		}

		if first {
			first = false

			if !sendHistoryOnStart && len(state.Seen) == 0 {
				for _, it := range items {
					seen.Add(itemIdentity(it))
				}
				state.Seen = seen.Snapshot()
				_ = store.Save(state)
				log.Printf("%s initialized (feed=%q items=%d)", logPrefix, feedTitle, len(items))
				return
			}
		}

		type datedItem struct {
			it  *gofeed.Item
			t   time.Time
			idx int
		}

		dated := make([]datedItem, 0, len(items))
		for i, it := range items {
			if it == nil {
				continue
			}
			id := itemIdentity(it)
			if id == "" || seen.Has(id) {
				continue
			}
			dated = append(dated, datedItem{it: it, t: itemTime(it), idx: i})
		}

		if len(dated) == 0 {
			return
		}

		sort.SliceStable(dated, func(i, j int) bool {
			a := dated[i]
			b := dated[j]
			if !a.t.IsZero() && !b.t.IsZero() {
				return a.t.Before(b.t)
			}
			if !a.t.IsZero() && b.t.IsZero() {
				return true
			}
			if a.t.IsZero() && !b.t.IsZero() {
				return false
			}
			return a.idx < b.idx
		})

		if len(dated) > task.MaxItemsPerPoll {
			dated = dated[len(dated)-task.MaxItemsPerPoll:]
		}

		for _, d := range dated {
			it := d.it
			seen.Add(itemIdentity(it))
			content, payload := formatItemCard(feedTitle, it, feedSiteURL, task.RSSURL)
			if payload == nil || strings.TrimSpace(anyToString(payload["url"])) == "" {
				continue
			}
			msg := sdk.WebhookPayload{
				Content:   content,
				Type:      "app/x-rss-card",
				Payload:   payload,
				Username:  feedTitle,
				AvatarURL: feedImageURL,
			}
			if err := sdk.PostWebhook(ctx, webhookHTTPClient, apiBase, task.Webhook, msg, 3); err != nil {
				log.Printf("%s post failed: %v", logPrefix, err)
			}
		}

		state.Seen = seen.Snapshot()
		_ = store.Save(state)
	}

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { fetchAndPost() })
}
