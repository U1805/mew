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

type RSSFetcherBotRunner struct {
	botID       string
	botName     string
	accessToken string
	apiBase     string
	tasks       []RSSFetchTaskConfig
}

func NewRSSFetcherBotRunner(botID, botName, accessToken, rawConfig, apiBase string) (*RSSFetcherBotRunner, error) {
	tasks, err := parseRSSTasks(rawConfig)
	if err != nil {
		return nil, err
	}

	return &RSSFetcherBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     apiBase,
		tasks:       tasks,
	}, nil
}

func (r *RSSFetcherBotRunner) Start() (stop func()) {
	g := sdk.NewGroup(context.Background())

	rssHTTPClient := &http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
		Timeout: 20 * time.Second,
	}
	webhookHTTPClient := &http.Client{Timeout: 15 * time.Second}

	for i, task := range r.tasks {
		if !isTaskEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runRSSTask(ctx, rssHTTPClient, webhookHTTPClient, r.apiBase, r.botID, r.botName, taskIndex, taskCopy)
		})
	}

	return g.Stop
}

func isTaskEnabled(v *bool) bool {
	if v == nil {
		return true
	}
	return *v
}

func boolOrDefault(v *bool, def bool) bool {
	if v == nil {
		return def
	}
	return *v
}

func runRSSTask(
	ctx context.Context,
	rssHTTPClient *http.Client,
	webhookHTTPClient *http.Client,
	apiBase string,
	botID, botName string,
	idx int,
	task RSSFetchTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[rss-fetcher-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	parser := gofeed.NewParser()

	statePath := taskStateFile(botID, idx, task.RSSURL)
	state, err := loadTaskState(statePath)
	if err != nil {
		log.Printf("%s failed to load state: %v", logPrefix, err)
	}

	seen := newSeenSet(1000)
	for _, id := range state.Seen {
		seen.Add(id)
	}

	first := true
	sendHistoryOnStart := boolOrDefault(task.SendHistoryOnStart, false)

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
				_ = saveTaskState(statePath, state)
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
		_ = saveTaskState(statePath, state)
	}

	fetchAndPost()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fetchAndPost()
		}
	}
}