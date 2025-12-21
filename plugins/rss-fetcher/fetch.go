package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/mmcdole/gofeed"
	"mew/plugins/sdk"
)

func fetchRSS(
	ctx context.Context,
	httpClient *http.Client,
	parser *gofeed.Parser,
	feedURL string,
	state *taskState,
) ([]*gofeed.Item, string, string, string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, "", "", "", false, err
	}
	req.Header.Set("User-Agent", sdk.RandomBrowserUserAgent())
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