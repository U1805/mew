package source

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

type Conditional struct {
	ETag         string
	LastModified string
}

type Result struct {
	Items        []*gofeed.Item
	FeedTitle    string
	FeedImageURL string
	FeedSiteURL  string

	ETag         string
	LastModified string

	NotModified bool
}

type Client struct {
	httpClient *http.Client
	parser     *gofeed.Parser
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{httpClient: httpClient, parser: gofeed.NewParser()}
}

func (c *Client) Fetch(ctx context.Context, feedURL string, cond Conditional) (Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("User-Agent", sdk.RandomBrowserUserAgent())
	if strings.TrimSpace(cond.ETag) != "" {
		req.Header.Set("If-None-Match", strings.TrimSpace(cond.ETag))
	}
	if strings.TrimSpace(cond.LastModified) != "" {
		req.Header.Set("If-Modified-Since", strings.TrimSpace(cond.LastModified))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return Result{
			NotModified:  true,
			FeedTitle:    strings.TrimSpace(feedURL),
			ETag:         strings.TrimSpace(cond.ETag),
			LastModified: strings.TrimSpace(cond.LastModified),
		}, nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return Result{}, fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return Result{}, err
	}

	feed, err := c.parser.Parse(bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}

	title := strings.TrimSpace(feed.Title)
	if title == "" {
		title = strings.TrimSpace(feedURL)
	}

	imageURL := ""
	if feed.Image != nil {
		imageURL = strings.TrimSpace(feed.Image.URL)
	}

	siteURL := strings.TrimSpace(feed.Link)
	if siteURL == "" {
		siteURL = strings.TrimSpace(feed.FeedLink)
	}

	return Result{
		Items:        feed.Items,
		FeedTitle:    title,
		FeedImageURL: imageURL,
		FeedSiteURL:  siteURL,
		ETag:         strings.TrimSpace(resp.Header.Get("ETag")),
		LastModified: strings.TrimSpace(resp.Header.Get("Last-Modified")),
		NotModified:  false,
	}, nil
}
