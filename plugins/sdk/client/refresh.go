package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func Refresh(ctx context.Context, httpClient *http.Client, apiBase string) (me User, token string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/auth/refresh", bytes.NewReader([]byte("{}")))
	if err != nil {
		return User{}, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return User{}, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return User{}, "", &HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var parsed struct {
		User  User   `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return User{}, "", err
	}
	if strings.TrimSpace(parsed.User.ID) == "" || strings.TrimSpace(parsed.Token) == "" {
		return User{}, "", fmt.Errorf("invalid /auth/refresh response: missing user/token")
	}

	return parsed.User, parsed.Token, nil
}
