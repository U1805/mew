package stickers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	sdkapi "mew/plugins/pkg/api"
)

type Sticker struct {
	ID          string   `json:"_id"`
	Scope       string   `json:"scope"`
	OwnerID     string   `json:"ownerId,omitempty"`
	ServerID    string   `json:"serverId,omitempty"`
	Name        string   `json:"name"`
	Group       string   `json:"group,omitempty"`
	Description string   `json:"description,omitempty"`
	Format      string   `json:"format,omitempty"`
	ContentType string   `json:"contentType,omitempty"`
	Size        int64    `json:"size,omitempty"`
	URL         string   `json:"url"`
}

func ListMyStickers(ctx context.Context, httpClient *http.Client, apiBase, userToken string) ([]Sticker, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("httpClient is required")
	}
	u := strings.TrimRight(apiBase, "/") + "/users/@me/stickers"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(userToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var stickers []Sticker
	if err := json.Unmarshal(body, &stickers); err != nil {
		return nil, err
	}
	return stickers, nil
}
