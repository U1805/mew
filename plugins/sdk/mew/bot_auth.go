package mew

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type User struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	IsBot    bool   `json:"isBot"`
}

func LoginBot(ctx context.Context, httpClient *http.Client, apiBase, accessToken string) (me User, token string, err error) {
	reqBody, err := json.Marshal(map[string]any{"accessToken": accessToken})
	if err != nil {
		return User{}, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/auth/bot", bytes.NewReader(reqBody))
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
		return User{}, "", fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		User  User   `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return User{}, "", err
	}
	if strings.TrimSpace(parsed.User.ID) == "" || strings.TrimSpace(parsed.Token) == "" {
		return User{}, "", fmt.Errorf("invalid /auth/bot response: missing user/token")
	}

	return parsed.User, parsed.Token, nil
}
