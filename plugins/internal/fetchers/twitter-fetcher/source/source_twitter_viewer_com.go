package source

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

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
