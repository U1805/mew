package source

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

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
