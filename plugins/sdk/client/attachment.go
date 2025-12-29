package client

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type AttachmentRef struct {
	ChannelID string `json:"-"`

	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

func DownloadAttachmentBytes(ctx context.Context, mewHTTPClient, externalHTTPClient *http.Client, apiBase, userToken string, att AttachmentRef, limit int64) ([]byte, error) {
	if limit <= 0 {
		return nil, fmt.Errorf("limit must be > 0")
	}

	key := strings.TrimSpace(att.Key)
	channelID := strings.TrimSpace(att.ChannelID)
	if key != "" && channelID != "" && strings.TrimSpace(userToken) != "" && mewHTTPClient != nil {
		u := fmt.Sprintf("%s/channels/%s/uploads/%s", strings.TrimRight(strings.TrimSpace(apiBase), "/"), url.PathEscape(channelID), url.PathEscape(key))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(userToken))
		resp, err := mewHTTPClient.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return io.ReadAll(io.LimitReader(resp.Body, limit))
			}
		}
	}

	rawURL := strings.TrimSpace(att.URL)
	if rawURL == "" {
		return nil, fmt.Errorf("missing attachment url")
	}

	if externalHTTPClient == nil {
		externalHTTPClient = mewHTTPClient
	}
	if externalHTTPClient == nil {
		return nil, fmt.Errorf("missing http client")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := externalHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download status=%d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}
