package source

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync/atomic"
	"time"

	"mew/plugins/pkg"
)

type Client struct {
	httpClient   *http.Client
	sourceCursor atomic.Uint64
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{httpClient: httpClient}
}

func (c *Client) FetchTimeline(ctx context.Context, handle string) (Timeline, error) {
	handle = strings.TrimSpace(strings.TrimPrefix(handle, "@"))
	if handle == "" {
		return Timeline{}, fmt.Errorf("empty handle")
	}

	client := c.getHTTPClient()
	ua := sdk.RandomBrowserUserAgent()
	sources := c.timelineSources()
	if len(sources) == 0 {
		return Timeline{}, fmt.Errorf("no timeline source configured")
	}

	start := int(c.sourceCursor.Add(1)-1) % len(sources)
	errMsgs := make([]string, 0, len(sources))
	for offset := range len(sources) {
		idx := (start + offset) % len(sources)
		src := sources[idx]

		tl, err := src.fetch(ctx, client, ua, handle)
		if err == nil {
			return tl, nil
		}
		errMsgs = append(errMsgs, fmt.Sprintf("%s: %v", src.name, err))
	}

	return Timeline{}, fmt.Errorf("all timeline sources failed: %s", strings.Join(errMsgs, "; "))
}

type timelineSource struct {
	name  string
	fetch func(ctx context.Context, client *http.Client, userAgent, handle string) (Timeline, error)
}

func (c *Client) timelineSources() []timelineSource {
	return []timelineSource{
		{name: "twitterviewer-net", fetch: c.fetchTwitterViewerTRPC},
		{name: "twitter-viewer-com", fetch: c.fetchTwitterViewerUserTweets},
		{name: "twitterwebviewer-com", fetch: c.fetchTwitterWebViewerUserTweets},
	}
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

func doRequest(ctx context.Context, client *http.Client, method, urlString string, body []byte, headers map[string]string) (status int, responseBody []byte, err error) {
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, urlString, bodyReader)
	if err != nil {
		return 0, nil, err
	}
	for k, v := range headers {
		if strings.TrimSpace(v) == "" {
			continue
		}
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, bodyBytes, nil
}
