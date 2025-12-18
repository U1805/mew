package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
)

type rssTaskRaw struct {
	Interval           int    `json:"interval"`
	IntervalSeconds    int    `json:"interval_seconds"`
	Webhook            string `json:"webhook"`
	RSSURL             string `json:"rss_url"`
	URL                string `json:"url"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
	MaxItemsPerPoll    int    `json:"max_items_per_poll"`
	UserAgent          string `json:"user_agent"`
}

type rssConfigWrapper struct {
	Tasks []rssTaskRaw `json:"tasks"`
}

type RSSFetchTaskConfig struct {
	IntervalSeconds    int
	Webhook            string
	RSSURL             string
	Enabled            *bool
	SendHistoryOnStart *bool
	MaxItemsPerPoll    int
	UserAgent          string
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

	var rawAny any
	if err := json.Unmarshal([]byte(rawConfig), &rawAny); err != nil {
		return nil, fmt.Errorf("config must be valid JSON: %w", err)
	}

	var rawTasks []rssTaskRaw
	switch rawAny.(type) {
	case []any:
		if err := json.Unmarshal([]byte(rawConfig), &rawTasks); err != nil {
			return nil, fmt.Errorf("config array decode failed: %w", err)
		}
	case map[string]any:
		var wrapper rssConfigWrapper
		if err := json.Unmarshal([]byte(rawConfig), &wrapper); err != nil {
			return nil, fmt.Errorf("config object decode failed: %w", err)
		}
		if len(wrapper.Tasks) > 0 {
			rawTasks = wrapper.Tasks
		} else {
			var single rssTaskRaw
			if err := json.Unmarshal([]byte(rawConfig), &single); err != nil {
				return nil, fmt.Errorf("config single task decode failed: %w", err)
			}
			rawTasks = []rssTaskRaw{single}
		}
	default:
		return nil, fmt.Errorf("config must be a JSON array or object")
	}

	validated := make([]RSSFetchTaskConfig, 0, len(rawTasks))
	for i, t := range rawTasks {
		interval := t.IntervalSeconds
		if interval <= 0 {
			interval = t.Interval
		}
		if interval <= 0 {
			return nil, fmt.Errorf("tasks[%d].interval(_seconds) must be > 0", i)
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

		rssURLStr := strings.TrimSpace(t.RSSURL)
		if rssURLStr == "" {
			rssURLStr = strings.TrimSpace(t.URL)
		}
		if rssURLStr == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url (or url) is required", i)
		}
		rssURL, err := url.Parse(rssURLStr)
		if err != nil || rssURL.Scheme == "" || rssURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be a valid URL", i)
		}
		if rssURL.Scheme != "http" && rssURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be http/https", i)
		}

		maxItems := t.MaxItemsPerPoll
		if maxItems <= 0 {
			maxItems = 5
		}
		if maxItems > 20 {
			maxItems = 20
		}

		userAgent := strings.TrimSpace(t.UserAgent)
		if userAgent == "" {
			userAgent = "mew-rss-fetcher-bot/1.0"
		}

		validated = append(validated, RSSFetchTaskConfig{
			IntervalSeconds:    interval,
			Webhook:            t.Webhook,
			RSSURL:             rssURLStr,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
			MaxItemsPerPoll:    maxItems,
			UserAgent:          userAgent,
		})
	}

	return validated, nil
}

type taskState struct {
	ETag         string   `json:"etag,omitempty"`
	LastModified string   `json:"last_modified,omitempty"`
	FeedTitle    string   `json:"feed_title,omitempty"`
	FeedImageURL string   `json:"feed_image_url,omitempty"`
	FeedSiteURL  string   `json:"feed_site_url,omitempty"`
	Seen         []string `json:"seen,omitempty"`
}

func taskStateFile(botID string, idx int, rssURL string) string {
	sum := sha256.Sum256([]byte(rssURL))
	shortHash := hex.EncodeToString(sum[:])[:12]
	dir := filepath.Join(os.TempDir(), "mew", "rss-fetcher", botID)
	return filepath.Join(dir, fmt.Sprintf("task-%d-%s.json", idx, shortHash))
}

func loadTaskState(path string) (taskState, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return taskState{}, nil
		}
		return taskState{}, err
	}
	var st taskState
	if err := json.Unmarshal(b, &st); err != nil {
		return taskState{}, err
	}
	return st, nil
}

func saveTaskState(path string, st taskState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	b, err := json.Marshal(st)
	if err != nil {
		return err
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	_ = os.Remove(path) // Windows rename doesn't overwrite.
	return os.Rename(tmp, path)
}

func runRSSTask(
	ctx context.Context,
	rssHTTPClient *http.Client,
	webhookHTTPClient *http.Client,
	botID, botName string,
	idx int,
	task RSSFetchTaskConfig,
) {
	interval := time.Duration(task.IntervalSeconds) * time.Second
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
		items, feedTitle, feedImageURL, feedSiteURL, notModified, err := fetchRSS(ctx, rssHTTPClient, parser, task.RSSURL, task.UserAgent, &state)
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
			msg := webhookMessage{
				Content:   content,
				Type:      "app/x-rss-card",
				Payload:   payload,
				Username:  feedTitle,
				AvatarURL: feedImageURL,
			}
			if err := postWebhookMessage(ctx, webhookHTTPClient, task.Webhook, msg); err != nil {
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

func anyToString(v any) string {
	s, _ := v.(string)
	return s
}

func fetchRSS(
	ctx context.Context,
	httpClient *http.Client,
	parser *gofeed.Parser,
	feedURL string,
	userAgent string,
	state *taskState,
) ([]*gofeed.Item, string, string, string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, "", "", "", false, err
	}
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	if state != nil && state.ETag != "" {
		req.Header.Set("If-None-Match", state.ETag)
	}
	if state != nil && state.LastModified != "" {
		req.Header.Set("If-Modified-Since", state.LastModified)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, "", "", "", false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		title := ""
		imageURL := ""
		siteURL := ""
		if state != nil {
			title = state.FeedTitle
			imageURL = state.FeedImageURL
			siteURL = state.FeedSiteURL
		}
		if strings.TrimSpace(title) == "" {
			title = feedURL
		}
		return nil, title, imageURL, siteURL, true, nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return nil, "", "", "", false, fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return nil, "", "", "", false, err
	}

	feed, err := parser.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, "", "", "", false, err
	}

	title := strings.TrimSpace(feed.Title)
	if title == "" {
		title = feedURL
	}

	imageURL := ""
	if feed.Image != nil {
		imageURL = strings.TrimSpace(feed.Image.URL)
	}

	siteURL := strings.TrimSpace(feed.Link)
	if siteURL == "" {
		siteURL = strings.TrimSpace(feed.FeedLink)
	}

	if state != nil {
		state.ETag = strings.TrimSpace(resp.Header.Get("ETag"))
		state.LastModified = strings.TrimSpace(resp.Header.Get("Last-Modified"))
		state.FeedTitle = title
		state.FeedImageURL = imageURL
		state.FeedSiteURL = siteURL
	}

	return feed.Items, title, imageURL, siteURL, false, nil
}

type webhookMessage struct {
	Content   string         `json:"content"`
	Type      string         `json:"type,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
	Username  string         `json:"username,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
}

var htmlTagRe = regexp.MustCompile(`(?is)<[^>]*>`)

func cleanText(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = htmlTagRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	s = strings.Join(strings.Fields(s), " ")
	return s
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return strings.TrimSpace(string(r[:max])) + "…"
}

func itemLink(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if s := strings.TrimSpace(it.Link); s != "" {
		return s
	}
	guid := strings.TrimSpace(it.GUID)
	if strings.HasPrefix(guid, "http://") || strings.HasPrefix(guid, "https://") {
		return guid
	}
	return ""
}

func itemPublished(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if it.PublishedParsed != nil {
		return it.PublishedParsed.UTC().Format(time.RFC3339)
	}
	if it.UpdatedParsed != nil {
		return it.UpdatedParsed.UTC().Format(time.RFC3339)
	}
	return strings.TrimSpace(it.Published)
}

func itemThumbnail(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if it.Image != nil {
		if s := strings.TrimSpace(it.Image.URL); s != "" {
			return s
		}
	}
	for _, enc := range it.Enclosures {
		if enc == nil {
			continue
		}
		if strings.HasPrefix(strings.TrimSpace(enc.Type), "image/") && strings.TrimSpace(enc.URL) != "" {
			return strings.TrimSpace(enc.URL)
		}
	}
	return ""
}

var imgSrcRe = regexp.MustCompile(`(?is)<img[^>]+src\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|([^\\s>]+))`)
var imgDataSrcRe = regexp.MustCompile(`(?is)<img[^>]+(?:data-src|data-original|data-lazy-src)\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|([^\\s>]+))`)

func firstImageFromHTML(htmlStr string, baseURL string) string {
	if strings.TrimSpace(htmlStr) == "" {
		return ""
	}

	if m := imgDataSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := normalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
			return u
		}
	}

	if m := imgSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := normalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
			return u
		}
	}

	return ""
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func normalizeMaybeURL(raw string, baseURL string) string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}

	if strings.Contains(raw, ",") {
		raw = strings.TrimSpace(strings.Split(raw, ",")[0])
	}
	raw = strings.TrimSpace(strings.Split(raw, " ")[0])

	raw = strings.Trim(raw, `"'`)
	raw = strings.TrimSpace(raw)

	if raw == "" || strings.HasPrefix(strings.ToLower(raw), "data:") {
		return ""
	}

	if strings.HasPrefix(raw, "//") {
		scheme := "https:"
		if u, err := url.Parse(baseURL); err == nil && u.Scheme != "" {
			scheme = u.Scheme + ":"
		}
		return scheme + raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Scheme == "http" || u.Scheme == "https" {
		return u.String()
	}

	base, err := url.Parse(baseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return ""
	}

	return base.ResolveReference(u).String()
}

func formatItemCard(feedTitle string, it *gofeed.Item, feedSiteURL string, feedURL string) (string, map[string]any) {
	if it == nil {
		return "", nil
	}
	title := cleanText(it.Title)
	if title == "" {
		title = "RSS 更新"
	}

	summary := cleanText(it.Description)
	if summary == "" {
		summary = cleanText(it.Content)
	}
	if summary == title {
		summary = ""
	}
	summary = truncateRunes(summary, 240)

	link := itemLink(it)
	thumb := itemThumbnail(it)
	if thumb == "" {
		base := link
		if base == "" {
			base = strings.TrimSpace(feedSiteURL)
		}
		if base == "" {
			base = strings.TrimSpace(feedURL)
		}
		thumb = firstImageFromHTML(it.Content, base)
		if thumb == "" {
			thumb = firstImageFromHTML(it.Description, base)
		}
	}
	publishedAt := itemPublished(it)

	payload := map[string]any{
		"title":         title,
		"summary":       summary,
		"url":           link,
		"thumbnail_url": thumb,
		"feed_title":    strings.TrimSpace(feedTitle),
		"published_at":  publishedAt,
	}

	content := title
	return content, payload
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

func postWebhookMessage(ctx context.Context, httpClient *http.Client, webhookURL string, msg webhookMessage) error {
	payload, _ := json.Marshal(msg)
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

func (s *seenSet) Snapshot() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.order...)
}
