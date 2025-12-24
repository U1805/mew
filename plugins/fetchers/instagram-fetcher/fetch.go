package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"mew/plugins/sdk"
)

type igUser struct {
	Biography            string `json:"biography"`
	BusinessCategoryName string `json:"business_category_name"`
	CategoryName         string `json:"category_name"`
	ExternalURL          string `json:"external_url"`
	FullName             string `json:"full_name"`
	ID                   string `json:"id"`
	ProfilePicURL        string `json:"profile_pic_url"`
	ProfilePicURLHD      string `json:"profile_pic_url_hd"`
	Username             string `json:"username"`
	EdgeFollow           int64  `json:"edge_follow"`
	EdgeFollowedBy       int64  `json:"edge_followed_by"`
	EdgesCount           int64  `json:"edges_count"`
	IsVerified           bool   `json:"is_verified"`
	IsPrivate            bool   `json:"is_private"`
	Edges                []igEdge
	Reels                []any `json:"reels"`
}

type igEdge struct {
	DisplayURL         string `json:"display_url"`
	DisplayURLFilename string `json:"display_url_filename"`
	ID                 string `json:"id"`
	IsVideo            *bool  `json:"is_video"`
	ThumbnailSrc       string `json:"thumbnail_src"`
	LikeCount          int64  `json:"like_count"`
	CommentCount       int64  `json:"comment_count"`
	TakenAt            int64  `json:"taken_at"`
	Title              string `json:"title"`
	VideoURL           string `json:"video_url"`
}

func (u *igUser) UnmarshalJSON(b []byte) error {
	type Alias igUser
	var tmp struct {
		Edges []igEdge `json:"edges"`
		*Alias
	}
	tmp.Alias = (*Alias)(u)
	if err := json.Unmarshal(b, &tmp); err != nil {
		return err
	}
	u.Edges = tmp.Edges
	return nil
}

func iqSavedDecodeURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return s
	}
	return "https://cdn.iqsaved.com/img2.php?url=" + url.QueryEscape(s)
}

func igRequestHeaders(req *http.Request, username, userAgent string) {
	if req == nil {
		return
	}
	ua := strings.TrimSpace(userAgent)
	if ua == "" {
		ua = sdk.RandomBrowserUserAgent()
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", "*/*")
	if strings.TrimSpace(username) != "" {
		req.Header.Set("Referer", "https://insta-stories-viewer.com/"+strings.TrimSpace(username)+"/")
	}
	req.Header.Set("Origin", "https://insta-stories-viewer.com")
}

func fetchInstagramUser(ctx context.Context, httpClient *http.Client, username string) (igUser, error) {
	target := strings.TrimSpace(username)
	target = strings.TrimPrefix(target, "@")
	if target == "" {
		return igUser{}, fmt.Errorf("username required")
	}
	if httpClient == nil {
		c, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
			Timeout:     30 * time.Second,
			CookieJar:   true,
			UseMEWProxy: true,
		})
		if err != nil {
			return igUser{}, err
		}
		httpClient = c
	}

	ua := sdk.RandomBrowserUserAgent()

	// 1) connect -> token
	connectReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://insta-stories-viewer.com/connect/", nil)
	if err != nil {
		return igUser{}, err
	}
	igRequestHeaders(connectReq, target, ua)

	connectResp, err := httpClient.Do(connectReq)
	if err != nil {
		return igUser{}, err
	}
	connectBody, _ := io.ReadAll(io.LimitReader(connectResp.Body, 2*1024*1024))
	_ = connectResp.Body.Close()
	if connectResp.StatusCode < 200 || connectResp.StatusCode >= 300 {
		return igUser{}, fmt.Errorf("connect status=%d body=%s", connectResp.StatusCode, strings.TrimSpace(string(connectBody)))
	}

	var connectParsed struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(connectBody, &connectParsed); err != nil {
		return igUser{}, fmt.Errorf("connect decode failed: %w", err)
	}
	apiToken := strings.TrimSpace(connectParsed.Token)
	if apiToken == "" {
		return igUser{}, fmt.Errorf("connect token missing")
	}

	// 2) socket.io handshake -> sid
	socketBase := "https://insta-stories-viewer.com/socket.io/"
	handshakeURL, _ := url.Parse(socketBase)
	q := handshakeURL.Query()
	q.Set("EIO", "4")
	q.Set("transport", "polling")
	q.Set("t", randomAlphaNum(6))
	handshakeURL.RawQuery = q.Encode()

	handshakeReq, err := http.NewRequestWithContext(ctx, http.MethodGet, handshakeURL.String(), nil)
	if err != nil {
		return igUser{}, err
	}
	igRequestHeaders(handshakeReq, target, ua)

	handshakeResp, err := httpClient.Do(handshakeReq)
	if err != nil {
		return igUser{}, err
	}
	handshakeBody, _ := io.ReadAll(io.LimitReader(handshakeResp.Body, 2*1024*1024))
	_ = handshakeResp.Body.Close()
	if handshakeResp.StatusCode < 200 || handshakeResp.StatusCode >= 300 {
		return igUser{}, fmt.Errorf("handshake status=%d body=%s", handshakeResp.StatusCode, strings.TrimSpace(string(handshakeBody)))
	}

	sid, err := parseSocketHandshakeSID(string(handshakeBody))
	if err != nil {
		return igUser{}, err
	}

	// 3) confirm "40"
	confirmURL, _ := url.Parse(socketBase)
	q = confirmURL.Query()
	q.Set("EIO", "4")
	q.Set("transport", "polling")
	q.Set("sid", sid)
	q.Set("t", randomAlphaNum(6))
	confirmURL.RawQuery = q.Encode()

	confirmReq, err := http.NewRequestWithContext(ctx, http.MethodPost, confirmURL.String(), strings.NewReader("40"))
	if err != nil {
		return igUser{}, err
	}
	igRequestHeaders(confirmReq, target, ua)
	confirmReq.Header.Set("Content-Type", "text/plain;charset=UTF-8")

	confirmResp, err := httpClient.Do(confirmReq)
	if err != nil {
		return igUser{}, err
	}
	confirmRespBody, _ := io.ReadAll(io.LimitReader(confirmResp.Body, 4096))
	_ = confirmResp.Body.Close()
	if confirmResp.StatusCode < 200 || confirmResp.StatusCode >= 300 {
		return igUser{}, fmt.Errorf("confirm status=%d body=%s", confirmResp.StatusCode, strings.TrimSpace(string(confirmRespBody)))
	}

	// 4) emit search event "42[...]"
	searchPayload := []any{
		"search",
		map[string]any{
			"username": target,
			"date":     time.Now().UnixMilli(),
			"token":    apiToken,
		},
	}
	searchJSON, _ := json.Marshal(searchPayload)
	searchBody := append([]byte("42"), searchJSON...)

	searchURL, _ := url.Parse(socketBase)
	q = searchURL.Query()
	q.Set("EIO", "4")
	q.Set("transport", "polling")
	q.Set("sid", sid)
	q.Set("t", randomAlphaNum(6))
	searchURL.RawQuery = q.Encode()

	searchReq, err := http.NewRequestWithContext(ctx, http.MethodPost, searchURL.String(), strings.NewReader(string(searchBody)))
	if err != nil {
		return igUser{}, err
	}
	igRequestHeaders(searchReq, target, ua)
	searchReq.Header.Set("Content-Type", "text/plain;charset=UTF-8")

	searchResp, err := httpClient.Do(searchReq)
	if err != nil {
		return igUser{}, err
	}
	searchRespBody, _ := io.ReadAll(io.LimitReader(searchResp.Body, 4096))
	_ = searchResp.Body.Close()
	if searchResp.StatusCode < 200 || searchResp.StatusCode >= 300 {
		return igUser{}, fmt.Errorf("search status=%d body=%s", searchResp.StatusCode, strings.TrimSpace(string(searchRespBody)))
	}

	// 5) long-poll for searchResult
	pollURL, _ := url.Parse(socketBase)
	q = pollURL.Query()
	q.Set("EIO", "4")
	q.Set("transport", "polling")
	q.Set("sid", sid)
	pollURL.RawQuery = q.Encode()

	for attempt := 0; attempt < 12; attempt++ {
		q := pollURL.Query()
		q.Set("t", randomAlphaNum(6))
		pollURL.RawQuery = q.Encode()

		pollReq, err := http.NewRequestWithContext(ctx, http.MethodGet, pollURL.String(), nil)
		if err != nil {
			return igUser{}, err
		}
		igRequestHeaders(pollReq, target, ua)

		pollResp, err := httpClient.Do(pollReq)
		if err != nil {
			return igUser{}, err
		}
		body, _ := io.ReadAll(io.LimitReader(pollResp.Body, 5*1024*1024))
		_ = pollResp.Body.Close()

		if pollResp.StatusCode < 200 || pollResp.StatusCode >= 300 {
			return igUser{}, fmt.Errorf("poll status=%d body=%s", pollResp.StatusCode, strings.TrimSpace(string(body)))
		}

		if u, ok := parseSearchResult(string(body)); ok {
			return u, nil
		}
	}

	return igUser{}, fmt.Errorf("searchResult not found (username=%s)", target)
}

func parseSocketHandshakeSID(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("empty handshake")
	}

	// Typical format: `0{"sid":"...","upgrades":["websocket"],...}`
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start < 0 || end < 0 || end <= start {
		return "", fmt.Errorf("invalid handshake: %s", trimForLog(s, 200))
	}

	var parsed struct {
		SID string `json:"sid"`
	}
	if err := json.Unmarshal([]byte(s[start:end+1]), &parsed); err != nil {
		return "", fmt.Errorf("handshake decode failed: %w", err)
	}
	sid := strings.TrimSpace(parsed.SID)
	if sid == "" {
		return "", fmt.Errorf("handshake sid missing")
	}
	return sid, nil
}

func parseSearchResult(raw string) (igUser, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return igUser{}, false
	}

	// Socket.IO may return multiple frames separated by RS (0x1e).
	frames := strings.Split(text, string(rune(0x1e)))
	for _, frame := range frames {
		f := strings.TrimSpace(frame)
		if f == "" {
			continue
		}

		// Only handle event packets (42...).
		if !strings.HasPrefix(f, "42") {
			continue
		}

		var arr []json.RawMessage
		if err := json.Unmarshal([]byte(f[2:]), &arr); err != nil {
			continue
		}
		if len(arr) < 2 {
			continue
		}

		var event string
		if err := json.Unmarshal(arr[0], &event); err != nil {
			continue
		}
		if event != "searchResult" {
			continue
		}

		var payload struct {
			Data struct {
				User igUser `json:"user"`
			} `json:"data"`
		}
		if err := json.Unmarshal(arr[1], &payload); err != nil {
			continue
		}

		if strings.TrimSpace(payload.Data.User.Username) == "" {
			return igUser{}, false
		}
		return payload.Data.User, true
	}

	return igUser{}, false
}

func trimForLog(s string, max int) string {
	ss := strings.TrimSpace(s)
	if max <= 0 || len(ss) <= max {
		return ss
	}
	return ss[:max] + "..."
}
