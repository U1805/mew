package source

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"mew/plugins/pkg"
)

func (c *Client) fetchInstaStoriesViewerSocketIO(ctx context.Context, httpClient *http.Client, userAgent, username string) ([]StoryItem, *UserProfile, error) {
	// 1) connect -> token
	connectReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://insta-stories-viewer.com/connect/", nil)
	if err != nil {
		return nil, nil, err
	}
	requestHeaders(connectReq, username, userAgent)

	connectResp, err := httpClient.Do(connectReq)
	if err != nil {
		return nil, nil, err
	}
	connectBody, _ := io.ReadAll(io.LimitReader(connectResp.Body, 2*1024*1024))
	_ = connectResp.Body.Close()
	if connectResp.StatusCode < 200 || connectResp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("connect status=%d body=%s", connectResp.StatusCode, strings.TrimSpace(string(connectBody)))
	}

	var connectParsed struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(connectBody, &connectParsed); err != nil {
		return nil, nil, fmt.Errorf("connect decode failed: %w", err)
	}
	apiToken := strings.TrimSpace(connectParsed.Token)
	if apiToken == "" {
		return nil, nil, fmt.Errorf("connect token missing")
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
		return nil, nil, err
	}
	requestHeaders(handshakeReq, username, userAgent)

	handshakeResp, err := httpClient.Do(handshakeReq)
	if err != nil {
		return nil, nil, err
	}
	handshakeBody, _ := io.ReadAll(io.LimitReader(handshakeResp.Body, 2*1024*1024))
	_ = handshakeResp.Body.Close()
	if handshakeResp.StatusCode < 200 || handshakeResp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("handshake status=%d body=%s", handshakeResp.StatusCode, strings.TrimSpace(string(handshakeBody)))
	}

	sid, err := parseSocketHandshakeSID(string(handshakeBody))
	if err != nil {
		return nil, nil, err
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
		return nil, nil, err
	}
	requestHeaders(confirmReq, username, userAgent)
	confirmReq.Header.Set("Content-Type", "text/plain;charset=UTF-8")

	confirmResp, err := httpClient.Do(confirmReq)
	if err != nil {
		return nil, nil, err
	}
	confirmRespBody, _ := io.ReadAll(io.LimitReader(confirmResp.Body, 4096))
	_ = confirmResp.Body.Close()
	if confirmResp.StatusCode < 200 || confirmResp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("confirm status=%d body=%s", confirmResp.StatusCode, strings.TrimSpace(string(confirmRespBody)))
	}

	// 4) emit search event "42[...]"
	searchPayload := []any{
		"search",
		map[string]any{
			"username": username,
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
		return nil, nil, err
	}
	requestHeaders(searchReq, username, userAgent)
	searchReq.Header.Set("Content-Type", "text/plain;charset=UTF-8")

	searchResp, err := httpClient.Do(searchReq)
	if err != nil {
		return nil, nil, err
	}
	searchRespBody, _ := io.ReadAll(io.LimitReader(searchResp.Body, 4096))
	_ = searchResp.Body.Close()
	if searchResp.StatusCode < 200 || searchResp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("search status=%d body=%s", searchResp.StatusCode, strings.TrimSpace(string(searchRespBody)))
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
			return nil, nil, err
		}
		requestHeaders(pollReq, username, userAgent)

		pollResp, err := httpClient.Do(pollReq)
		if err != nil {
			return nil, nil, err
		}
		body, _ := io.ReadAll(io.LimitReader(pollResp.Body, 5*1024*1024))
		_ = pollResp.Body.Close()

		if pollResp.StatusCode < 200 || pollResp.StatusCode >= 300 {
			return nil, nil, fmt.Errorf("poll status=%d body=%s", pollResp.StatusCode, strings.TrimSpace(string(body)))
		}

		if user, ok := parseSearchResult(string(body)); ok {
			stories := append([]StoryItem(nil), user.Edges...)
			user.Edges = nil
			return stories, &user, nil
		}
	}

	return nil, nil, fmt.Errorf("searchResult not found (username=%s)", username)
}

func requestHeaders(req *http.Request, username, userAgent string) {
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

func parseSocketHandshakeSID(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("empty handshake")
	}

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

func parseSearchResult(raw string) (UserProfile, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return UserProfile{}, false
	}

	frames := strings.Split(text, string(rune(0x1e)))
	for _, frame := range frames {
		f := strings.TrimSpace(frame)
		if f == "" {
			continue
		}

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
				User UserProfile `json:"user"`
			} `json:"data"`
		}
		if err := json.Unmarshal(arr[1], &payload); err != nil {
			continue
		}

		if strings.TrimSpace(payload.Data.User.Username) == "" {
			return UserProfile{}, false
		}
		return payload.Data.User, true
	}

	return UserProfile{}, false
}

func trimForLog(s string, max int) string {
	ss := strings.TrimSpace(s)
	if max <= 0 || len(ss) <= max {
		return ss
	}
	return ss[:max] + "..."
}

func randomAlphaNum(length int) string {
	if length <= 0 {
		return "0"
	}
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	var b strings.Builder
	b.Grow(length)

	max := big.NewInt(int64(len(chars)))
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return fmt.Sprintf("%d", i)
		}
		b.WriteByte(chars[n.Int64()])
	}
	return b.String()
}
