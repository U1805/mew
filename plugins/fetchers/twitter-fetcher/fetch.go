package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"mew/plugins/sdk"
)

type twitterViewerResponseItem struct {
	Result struct {
		Data struct {
			User struct {
				RestID           string `json:"restId"`
				Handle           string `json:"handle"`
				Name             string `json:"name"`
				ProfileImageURL  string `json:"profileImageUrl"`
				ProfileBannerURL string `json:"profileBannerUrl"`
			} `json:"user"`
			Users    map[string]twitterViewerUser `json:"users"`
			Timeline struct {
				Items []twitterViewerTimelineItem `json:"items"`
			} `json:"timeline"`
		} `json:"data"`
	} `json:"result"`
}

type twitterViewerUser struct {
	RestID          string `json:"restId"`
	Handle          string `json:"handle"`
	Name            string `json:"name"`
	ProfileImageURL string `json:"profileImageUrl"`
}

type twitterViewerTimelineItem struct {
	Type  string             `json:"type"`
	Tweet twitterViewerTweet `json:"tweet"`
}

type twitterViewerTweet struct {
	RestID      string   `json:"restId"`
	UserID      string   `json:"userId"`
	FullText    string   `json:"fullText"`
	DisplayText string   `json:"displayText"`
	CreatedAt   string   `json:"createdAt"`
	Images      []string `json:"images"`
	Pinned      bool     `json:"pinned"`

	BookmarkCount     int64  `json:"bookmarkCount"`
	FavoriteCount     int64  `json:"favoriteCount"`
	QuoteCount        int64  `json:"quoteCount"`
	ReplyCount        int64  `json:"replyCount"`
	RetweetCount      int64  `json:"retweetCount"`
	ViewCount         *int64 `json:"viewCount"`
	PossiblySensitive bool   `json:"possiblySensitive"`

	Video *twitterViewerVideo `json:"video"`

	RetweetedTweet *twitterViewerTweet `json:"retweetedTweet"`
	QuotedTweet    *twitterViewerTweet `json:"quotedTweet"`
}

type twitterViewerVideo struct {
	AspectRatio    []int64 `json:"aspectRatio"`
	DurationMillis int64   `json:"durationMillis"`
	CoverURL       string  `json:"coverUrl"`
	VideoURL       string  `json:"videoUrl"`
	Variants       []struct {
		Bitrate     *int64 `json:"bitrate"`
		URL         string `json:"url"`
		ContentType string `json:"contentType"`
	} `json:"variants"`
}

type twitterTimeline struct {
	MonitoredUser twitterViewerUser
	Users         map[string]twitterViewerUser
	Items         []twitterViewerTimelineItem
}

func ensureTwitterViewerUTIDCookie(ctx context.Context, client *http.Client, userAgent string) error {
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

func fetchTwitterViewerTimeline(ctx context.Context, client *http.Client, handle string) (twitterTimeline, error) {
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

	if client == nil {
		client = &http.Client{Timeout: 25 * time.Second, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment}}
	}
	if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		client.Jar = jar
	}

	// twitterviewer.net currently requires a `_utid` cookie (issued by `/_trace`) to access API routes.
	// Without it, the API returns `501 bad api`.
	needsTrace := true
	if base, err := url.Parse("https://twitterviewer.net/"); err == nil {
		for _, c := range client.Jar.Cookies(base) {
			if c != nil && c.Name == "_utid" && strings.TrimSpace(c.Value) != "" {
				needsTrace = false
				break
			}
		}
	}
	if needsTrace {
		_ = ensureTwitterViewerUTIDCookie(ctx, client, ua)
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
		return twitterTimeline{}, err
	}
	if status == http.StatusNotImplemented && strings.Contains(strings.ToLower(string(body)), "bad api") {
		// Cookie may have expired or been evicted; refresh and retry once.
		if err := ensureTwitterViewerUTIDCookie(ctx, client, ua); err == nil {
			status, body, err = doRequest()
			if err != nil {
				return twitterTimeline{}, err
			}
		}
	}
	if status < 200 || status >= 300 {
		return twitterTimeline{}, fmt.Errorf("twitterviewer http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

	var parsed []twitterViewerResponseItem
	if err := json.Unmarshal(body, &parsed); err != nil {
		return twitterTimeline{}, fmt.Errorf("decode twitterviewer response failed: %w", err)
	}
	if len(parsed) == 0 {
		return twitterTimeline{}, fmt.Errorf("empty twitterviewer response")
	}

	data := parsed[0].Result.Data
	users := data.Users
	if users == nil {
		users = map[string]twitterViewerUser{}
	}
	monitored := twitterViewerUser{
		RestID:          data.User.RestID,
		Handle:          data.User.Handle,
		Name:            data.User.Name,
		ProfileImageURL: data.User.ProfileImageURL,
	}
	if monitored.RestID != "" {
		users[monitored.RestID] = monitored
	}

	return twitterTimeline{
		MonitoredUser: monitored,
		Users:         users,
		Items:         data.Timeline.Items,
	}, nil
}

func tweetCreatedAt(twitterCreatedAt string) time.Time {
	s := strings.TrimSpace(twitterCreatedAt)
	if s == "" {
		return time.Time{}
	}
	tt, err := time.Parse(time.RubyDate, s)
	if err != nil {
		return time.Time{}
	}
	return tt
}

func buildTweetURL(users map[string]twitterViewerUser, userID, tweetID string) string {
	tweetID = strings.TrimSpace(tweetID)
	if tweetID == "" {
		return ""
	}

	handle := strings.TrimSpace(userID)
	if u, ok := users[userID]; ok && strings.TrimSpace(u.Handle) != "" {
		handle = u.Handle
	}
	handle = strings.TrimSpace(handle)
	if handle != "" && handle != userID {
		return fmt.Sprintf("https://x.com/%s/status/%s", handle, tweetID)
	}
	return fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
}

func pickBestVideoURL(v *twitterViewerVideo) (videoURL string, contentType string) {
	if v == nil {
		return "", ""
	}
	if strings.TrimSpace(v.VideoURL) != "" {
		return strings.TrimSpace(v.VideoURL), "video/mp4"
	}
	type cand struct {
		bitrate int64
		url     string
		ct      string
	}
	cands := make([]cand, 0, len(v.Variants))
	for _, vv := range v.Variants {
		if strings.TrimSpace(vv.URL) == "" {
			continue
		}
		if strings.TrimSpace(vv.ContentType) != "video/mp4" {
			continue
		}
		br := int64(0)
		if vv.Bitrate != nil {
			br = *vv.Bitrate
		}
		cands = append(cands, cand{bitrate: br, url: vv.URL, ct: vv.ContentType})
	}
	if len(cands) == 0 {
		return "", ""
	}

	// Prefer a mid-bitrate variant to avoid large uploads (webhook upload limit is small).
	sort.SliceStable(cands, func(i, j int) bool { return cands[i].bitrate < cands[j].bitrate })
	target := int64(2_500_000)
	bestIdx := 0
	bestDist := int64(1<<63 - 1)
	for i, c := range cands {
		if c.bitrate == 0 {
			continue
		}
		dist := c.bitrate - target
		if dist < 0 {
			dist = -dist
		}
		if dist < bestDist {
			bestDist = dist
			bestIdx = i
		}
	}
	return strings.TrimSpace(cands[bestIdx].url), "video/mp4"
}

func safeInt64ToString(v *int64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatInt(*v, 10)
}
