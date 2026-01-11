package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func FetchDMChannels(ctx context.Context, httpClient *http.Client, apiBase, userToken string) (map[string]struct{}, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(apiBase, "/")+"/users/@me/channels", nil)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+userToken)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var channels []struct {
		ID   string `json:"_id"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &channels); err != nil {
		return nil, err
	}

	next := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		if strings.TrimSpace(ch.ID) == "" {
			continue
		}
		if ch.Type != "DM" {
			continue
		}
		next[ch.ID] = struct{}{}
	}
	return next, nil
}
