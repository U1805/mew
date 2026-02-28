package source

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"mew/plugins/pkg"
)

const flareSolverrEnvURL = "FLARESOLVERR_URL"

type Client struct {
	httpClient   *http.Client
	sourceCursor atomic.Uint64
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

func (c *Client) FetchFeed(ctx context.Context, username string) (Feed, error) {
	target := strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if target == "" {
		return Feed{}, fmt.Errorf("username required")
	}

	httpClient := c.getHTTPClient()
	ua := sdk.RandomBrowserUserAgent()
	sources := c.feedSources()
	if len(sources) == 0 {
		return Feed{}, fmt.Errorf("no feed source configured")
	}

	start := int(c.sourceCursor.Add(1)-1) % len(sources)
	errMsgs := make([]string, 0, len(sources))
	for offset := range len(sources) {
		idx := (start + offset) % len(sources)
		src := sources[idx]

		feed, err := src.fetch(ctx, httpClient, ua, target)
		if err == nil {
			return feed, nil
		}
		errMsgs = append(errMsgs, fmt.Sprintf("%s: %v", src.name, err))
	}
	return Feed{}, fmt.Errorf("all feed sources failed: %s", strings.Join(errMsgs, "; "))
}

type feedSource struct {
	name  string
	fetch func(ctx context.Context, client *http.Client, userAgent, username string) (Feed, error)
}

func (c *Client) feedSources() []feedSource {
	sources := make([]feedSource, 0, 2)
	if strings.TrimSpace(os.Getenv(flareSolverrEnvURL)) != "" {
		sources = append(sources, feedSource{name: "urlebird-flaresolverr", fetch: c.fetchUrlebirdViaFlareSolverr})
	}
	sources = append(sources, feedSource{name: "urlebird-http", fetch: c.fetchUrlebirdDirect})
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
