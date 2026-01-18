package source

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	BiliUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
	BiliReferer   = "https://www.bilibili.com/"
)

type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{httpClient: httpClient}
}

func (c *Client) FetchDynamics(ctx context.Context, uid string) ([]APIItem, error) {
	targetUID := strings.TrimSpace(uid)
	if targetUID == "" {
		return nil, fmt.Errorf("uid required")
	}

	httpClient := c.httpClient
	if httpClient == nil {
		return nil, fmt.Errorf("http client required")
	}

	targetURL := fmt.Sprintf("https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=%s&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,forwardListHidden,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment", targetUID)

	cookieHeader, err := requestBiliCookieHeader(ctx, httpClient)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for i := 0; i < 30; i++ { // retry for -352
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return nil, err
		}

		req.Header.Set("User-Agent", BiliUserAgent)
		req.Header.Set("Referer", BiliReferer)
		req.Header.Set("Cookie", cookieHeader)

		resp, err := httpClient.Do(req)
		if err != nil {
			lastErr = err
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(500 * time.Millisecond):
				continue
			}
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("unexpected status: %s (body=%s)", resp.Status, string(body))
			continue
		}

		var apiResp APIResponse
		if err := json.Unmarshal(body, &apiResp); err != nil {
			lastErr = fmt.Errorf("failed to decode json: %w (body=%s)", err, string(body))
			continue
		}

		if apiResp.Code == -352 {
			lastErr = fmt.Errorf("api error code -352, retrying...")
			if refreshed, err := requestBiliCookieHeader(ctx, httpClient); err == nil && refreshed != "" {
				cookieHeader = refreshed
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Second):
				continue
			}
		}

		if apiResp.Code != 0 {
			return nil, fmt.Errorf("api error: code=%d, message=%s", apiResp.Code, apiResp.Message)
		}

		return apiResp.Data.Items, nil
	}

	return nil, fmt.Errorf("failed to fetch bilibili dynamics after retries: %w", lastErr)
}
