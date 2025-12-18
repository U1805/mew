package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
)

type RSSFetchTaskConfig struct {
	Interval           int    `json:"interval"`
	Webhook            string `json:"webhook"`
	RSSURL             string `json:"rss_url"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
}

type RSSFetcherBotRunner struct {
	botID   string
	botName string
	tasks   []RSSFetchTaskConfig
}

func NewRSSFetcherBotRunner(botID, botName, rawConfig string) (*RSSFetcherBotRunner, error) {
	tasks, err := parseRSSTasks(rawConfig)
	if err != nil {
		return nil, err
	}
	return &RSSFetcherBotRunner{
		botID:   botID,
		botName: botName,
		tasks:   tasks,
	}, nil
}

func (r *RSSFetcherBotRunner) Start() (stop func()) {
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	rssHTTPClient := &http.Client{Timeout: 20 * time.Second}
	webhookHTTPClient := &http.Client{Timeout: 15 * time.Second}

	for i, task := range r.tasks {
		if !isTaskEnabled(task.Enabled) {
			continue
		}

		taskIndex := i
		taskCopy := task
		wg.Add(1)
		go func() {
			defer wg.Done()
			runRSSTask(ctx, rssHTTPClient, webhookHTTPClient, r.botID, r.botName, taskIndex, taskCopy)
		}()
	}

	return func() {
		cancel()
		wg.Wait()
	}
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

func parseRSSTasks(rawConfig string) ([]RSSFetchTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	var tasks []RSSFetchTaskConfig
	if err := json.Unmarshal([]byte(rawConfig), &tasks); err != nil {
		return nil, fmt.Errorf("config must be a JSON array: %w", err)
	}

	validated := make([]RSSFetchTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if t.Interval <= 0 {
			return nil, fmt.Errorf("tasks[%d].interval must be > 0", i)
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		webhookURL, err := url.Parse(t.Webhook)
		if err != nil || webhookURL.Scheme == "" || webhookURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].webhook must be a valid URL", i)
		}
		if webhookURL.Scheme != "http" && webhookURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].webhook must be http/https", i)
		}

		if strings.TrimSpace(t.RSSURL) == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url is required", i)
		}
		rssURL, err := url.Parse(t.RSSURL)
		if err != nil || rssURL.Scheme == "" || rssURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be a valid URL", i)
		}
		if rssURL.Scheme != "http" && rssURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be http/https", i)
		}

		validated = append(validated, t)
	}

	return validated, nil
}

func runRSSTask(
	ctx context.Context,
	rssHTTPClient *http.Client,
	webhookHTTPClient *http.Client,
	botID, botName string,
	idx int,
	task RSSFetchTaskConfig,
) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[rss-fetcher-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	parser := gofeed.NewParser()
	parser.Client = rssHTTPClient

	seen := newSeenSet(300)
	first := true
	sendHistoryOnStart := boolOrDefault(task.SendHistoryOnStart, false)

	fetchAndPost := func() {
		items, feedTitle, err := fetchRSS(ctx, parser, task.RSSURL)
		if err != nil {
			log.Printf("%s fetch failed (rss_url=%s): %v", logPrefix, task.RSSURL, err)
			return
		}

		if first {
			first = false

			if !sendHistoryOnStart {
				for _, it := range items {
					seen.Add(itemIdentity(it))
				}
				log.Printf("%s initialized (feed=%q items=%d)", logPrefix, feedTitle, len(items))
				return
			}
		}

		newItems := make([]*gofeed.Item, 0, len(items))
		for _, it := range items {
			id := itemIdentity(it)
			if id == "" || seen.Has(id) {
				continue
			}
			newItems = append(newItems, it)
		}

		if len(newItems) == 0 {
			return
		}

		sort.SliceStable(newItems, func(i, j int) bool {
			ti := itemTime(newItems[i])
			tj := itemTime(newItems[j])
			if ti.IsZero() || tj.IsZero() {
				return false
			}
			return ti.Before(tj)
		})

		for _, it := range newItems {
			seen.Add(itemIdentity(it))
			content := formatItemMessage(feedTitle, it)
			if err := postWebhookOnce(ctx, webhookHTTPClient, task.Webhook, content); err != nil {
				log.Printf("%s post failed: %v", logPrefix, err)
			}
		}
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

func fetchRSS(ctx context.Context, parser *gofeed.Parser, feedURL string) ([]*gofeed.Item, string, error) {
	feed, err := parser.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, "", err
	}
	title := strings.TrimSpace(feed.Title)
	if title == "" {
		title = feedURL
	}
	return feed.Items, title, nil
}

func formatItemMessage(feedTitle string, it *gofeed.Item) string {
	title := strings.TrimSpace(it.Title)
	link := strings.TrimSpace(it.Link)
	pub := ""
	if it.PublishedParsed != nil {
		pub = it.PublishedParsed.Local().Format(time.RFC3339)
	} else {
		pub = strings.TrimSpace(it.Published)
	}

	lines := []string{
		fmt.Sprintf("RSS 更新：%s", feedTitle),
	}
	if title != "" {
		lines = append(lines, title)
	}
	if link != "" {
		lines = append(lines, link)
	}
	if pub != "" {
		lines = append(lines, pub)
	}
	return strings.Join(lines, "\n")
}

func itemTime(it *gofeed.Item) time.Time {
	if it.PublishedParsed != nil {
		return *it.PublishedParsed
	}
	if it.UpdatedParsed != nil {
		return *it.UpdatedParsed
	}
	return time.Time{}
}

func itemIdentity(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if s := strings.TrimSpace(it.GUID); s != "" {
		return s
	}
	if s := strings.TrimSpace(it.Link); s != "" {
		return s
	}
	title := strings.TrimSpace(it.Title)
	pub := strings.TrimSpace(it.Published)
	if title == "" && pub == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(title + "\n" + pub))
	return hex.EncodeToString(sum[:])
}

func postWebhookOnce(ctx context.Context, httpClient *http.Client, webhookURL, content string) error {
	payload, _ := json.Marshal(map[string]any{"content": content})
	return postJSONWithRetry(ctx, httpClient, webhookURL, payload, 3)
}

func postJSONWithRetry(ctx context.Context, httpClient *http.Client, webhookURL string, body []byte, attempts int) error {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := postJSON(ctx, httpClient, webhookURL, body); err != nil {
			lastErr = err
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				continue
			}
		}
		return nil
	}
	return lastErr
}

func postJSON(ctx context.Context, httpClient *http.Client, webhookURL string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(respBody))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return errors.New(msg)
	}
	return nil
}

type seenSet struct {
	mu    sync.Mutex
	max   int
	order []string
	set   map[string]struct{}
}

func newSeenSet(max int) *seenSet {
	if max <= 0 {
		max = 200
	}
	return &seenSet{
		max: max,
		set: make(map[string]struct{}, max),
	}
}

func (s *seenSet) Has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.set[id]
	return ok
}

func (s *seenSet) Add(id string) {
	if id == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.set[id]; ok {
		return
	}

	s.set[id] = struct{}{}
	s.order = append(s.order, id)

	if len(s.order) <= s.max {
		return
	}

	overflow := len(s.order) - s.max
	for i := 0; i < overflow; i++ {
		old := s.order[i]
		delete(s.set, old)
	}
	s.order = append([]string(nil), s.order[overflow:]...)
}

