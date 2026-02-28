package source

import (
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"mew/plugins/pkg"
)

type Client struct {
	httpClient          *http.Client
	sourceCursor        atomic.Uint64
	storySourceProvider func() []storySource
}

func NewClient(useProxy bool) (*Client, error) {
	opts := sdk.HTTPClientOptions{
		Timeout:   30 * time.Second,
		CookieJar: true,
		Mode:      "direct",
	}
	if useProxy {
		opts.Mode = "proxy"
	}
	httpClient, err := sdk.NewHTTPClient(opts)
	if err != nil {
		return nil, err
	}
	return &Client{httpClient: httpClient}, nil
}

func (c *Client) FetchStories(ctx context.Context, username string) ([]StoryItem, *UserProfile, error) {
	target := strings.TrimSpace(username)
	target = strings.TrimPrefix(target, "@")
	if target == "" {
		return nil, nil, fmt.Errorf("username required")
	}

	httpClient := c.getHTTPClient()
	ua := sdk.RandomBrowserUserAgent()
	sources := c.storySources()
	if len(sources) == 0 {
		return nil, nil, fmt.Errorf("no story source configured")
	}

	start := int(c.sourceCursor.Add(1)-1) % len(sources)
	errMsgs := make([]string, 0, len(sources))
	for offset := range len(sources) {
		idx := (start + offset) % len(sources)
		source := sources[idx]

		stories, profile, err := source.fetch(ctx, httpClient, ua, target)
		if err == nil {
			return mergeStoriesByPost(stories), profile, nil
		}
		errMsgs = append(errMsgs, fmt.Sprintf("%s: %v", source.name, err))
	}

	return nil, nil, fmt.Errorf("all story sources failed: %s", strings.Join(errMsgs, "; "))
}

type storySource struct {
	name  string
	fetch func(ctx context.Context, client *http.Client, userAgent, username string) ([]StoryItem, *UserProfile, error)
}

func (c *Client) storySources() []storySource {
	if c.storySourceProvider != nil {
		return c.storySourceProvider()
	}
	sources := []storySource{
		{name: "picuki-site", fetch: c.fetchPicukiPosts},
	}
	if strings.TrimSpace(os.Getenv("FLARESOLVERR_URL")) != "" {
		sources = append(sources, storySource{name: "imginn", fetch: c.fetchImginn})
	}
	return sources
}

func (c *Client) getHTTPClient() *http.Client {
	client := c.httpClient
	if client == nil {
		tmp, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
			Timeout:   30 * time.Second,
			CookieJar: true,
			Mode:      "proxy",
		})
		if err != nil {
			client = &http.Client{Timeout: 30 * time.Second, Transport: http.DefaultTransport}
		} else {
			client = tmp
		}
	}
	if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		client.Jar = jar
	}
	return client
}
