package source

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"mew/plugins/pkg"
	"mew/plugins/pkg/x/httpx"
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
		{name: "twitterviewer-trpc", fetch: c.fetchTwitterViewerTRPC},
		{name: "twitter-viewer-user-tweets", fetch: c.fetchTwitterViewerUserTweets},
		{name: "twitterwebviewer-user-tweets", fetch: c.fetchTwitterWebViewerUserTweets},
	}
}

func (c *Client) getHTTPClient() *http.Client {
	client := c.httpClient
	if client == nil {
		tmp, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
			Timeout:   25 * time.Second,
			CookieJar: true,
			Transport: httpx.NewTransport(nil),
		})
		if err != nil {
			client = &http.Client{Timeout: 25 * time.Second, Transport: http.DefaultTransport}
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

func (c *Client) fetchTwitterViewerTRPC(ctx context.Context, client *http.Client, userAgent, handle string) (Timeline, error) {

	u := &url.URL{
		Scheme: "https",
		Host:   "twitterviewer.net",
		Path:   "/api/trpc/getUserTimeline",
	}
	q := u.Query()
	q.Set("batch", "1")
	input := map[string]any{
		"0": map[string]any{
			"handle": handle,
		},
	}
	inputBytes, _ := json.Marshal(input)
	q.Set("input", string(inputBytes))
	u.RawQuery = q.Encode()

	needsTrace := true
	if base, err := url.Parse("https://twitterviewer.net/"); err == nil {
		for _, ck := range client.Jar.Cookies(base) {
			if ck != nil && ck.Name == "_utid" && strings.TrimSpace(ck.Value) != "" {
				needsTrace = false
				break
			}
		}
	}
	if needsTrace {
		_ = ensureUTIDCookie(ctx, client, userAgent)
	}

	doRequest := func() (status int, body []byte, err error) {
		return doRequest(ctx, client, http.MethodGet, u.String(), nil, map[string]string{
			"User-Agent":      userAgent,
			"Accept":          "*/*",
			"Referer":         "https://twitterviewer.net/",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control":   "no-cache",
			"Pragma":          "no-cache",
		})
	}

	status, body, err := doRequest()
	if err != nil {
		return Timeline{}, err
	}
	if status == http.StatusNotImplemented && strings.Contains(strings.ToLower(string(body)), "bad api") {
		if err := ensureUTIDCookie(ctx, client, userAgent); err == nil {
			status, body, err = doRequest()
			if err != nil {
				return Timeline{}, err
			}
		}
	}
	if status < 200 || status >= 300 {
		return Timeline{}, fmt.Errorf("twitterviewer http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

	return parseTwitterViewerTRPCResponse(body)
}

func (c *Client) fetchTwitterViewerUserTweets(ctx context.Context, client *http.Client, userAgent, handle string) (Timeline, error) {
	u := &url.URL{
		Scheme: "https",
		Host:   "www.twitter-viewer.com",
		Path:   "/api/x/user-tweets",
	}
	q := u.Query()
	q.Set("username", handle)
	q.Set("cursor", "")
	u.RawQuery = q.Encode()

	status, body, err := doRequest(ctx, client, http.MethodGet, u.String(), nil, map[string]string{
		"User-Agent":      userAgent,
		"Accept":          "*/*",
		"Referer":         "https://www.twitter-viewer.com/",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control":   "no-cache",
		"Pragma":          "no-cache",
	})
	if err != nil {
		return Timeline{}, err
	}
	if status < 200 || status >= 300 {
		return Timeline{}, fmt.Errorf("twitter-viewer http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

	return parseViewerCompatResponse(body, handle)
}

func (c *Client) fetchTwitterWebViewerUserTweets(ctx context.Context, client *http.Client, userAgent, handle string) (Timeline, error) {
	u := &url.URL{
		Scheme: "https",
		Host:   "twitterwebviewer.com",
		Path:   "/api/tweets/" + handle,
	}

	status, body, err := doRequest(ctx, client, http.MethodGet, u.String(), nil, map[string]string{
		"User-Agent":      userAgent,
		"Accept":          "*/*",
		"Referer":         "https://twitterwebviewer.com/?user=" + handle,
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control":   "no-cache",
		"Pragma":          "no-cache",
	})
	if err != nil {
		return Timeline{}, err
	}
	if status < 200 || status >= 300 {
		return Timeline{}, fmt.Errorf("twitterwebviewer http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

	return parseViewerCompatResponse(body, handle)
}

func parseTwitterViewerTRPCResponse(body []byte) (Timeline, error) {

	var parsed []ViewerResponseItem
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Timeline{}, fmt.Errorf("decode twitterviewer response failed: %w", err)
	}
	if len(parsed) == 0 {
		return Timeline{}, fmt.Errorf("empty twitterviewer response")
	}

	data := parsed[0].Result.Data
	users := data.Users
	if users == nil {
		users = map[string]User{}
	}

	monitored := User{
		RestID:          data.User.RestID,
		Handle:          data.User.Handle,
		Name:            data.User.Name,
		ProfileImageURL: data.User.ProfileImageURL,
	}
	if strings.TrimSpace(monitored.RestID) != "" {
		users[monitored.RestID] = monitored
	}

	return Timeline{
		MonitoredUser: monitored,
		Users:         users,
		Items:         data.Timeline.Items,
	}, nil
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

func ensureUTIDCookie(ctx context.Context, client *http.Client, userAgent string) error {
	if client == nil {
		return fmt.Errorf("nil http client")
	}
	if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		client.Jar = jar
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://twitterviewer.net/_trace", nil)
	if err != nil {
		return err
	}
	if strings.TrimSpace(userAgent) != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Referer", "https://twitterviewer.net/")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("twitterviewer trace http status=%d", resp.StatusCode)
	}
	return nil
}
