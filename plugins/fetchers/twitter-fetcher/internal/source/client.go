package source

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"

	"mew/plugins/sdk"
	"mew/plugins/sdk/x/httpx"
)

type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{httpClient: httpClient}
}

func (c *Client) FetchTimeline(ctx context.Context, handle string) (Timeline, error) {
	ua := sdk.RandomBrowserUserAgent()

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
		_ = ensureUTIDCookie(ctx, client, ua)
	}

	doRequest := func() (status int, body []byte, err error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return 0, nil, err
		}
		req.Header.Set("User-Agent", ua)
		req.Header.Set("Accept", "*/*")
		req.Header.Set("Referer", "https://twitterviewer.net/")
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		req.Header.Set("Cache-Control", "no-cache")
		req.Header.Set("Pragma", "no-cache")

		resp, err := client.Do(req)
		if err != nil {
			return 0, nil, err
		}
		defer resp.Body.Close()

		bodyBytes, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, bodyBytes, nil
	}

	status, body, err := doRequest()
	if err != nil {
		return Timeline{}, err
	}
	if status == http.StatusNotImplemented && strings.Contains(strings.ToLower(string(body)), "bad api") {
		if err := ensureUTIDCookie(ctx, client, ua); err == nil {
			status, body, err = doRequest()
			if err != nil {
				return Timeline{}, err
			}
		}
	}
	if status < 200 || status >= 300 {
		return Timeline{}, fmt.Errorf("twitterviewer http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

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
