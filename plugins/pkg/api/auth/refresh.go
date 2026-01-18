package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	sdkapi "mew/plugins/pkg/api"
)

func Refresh(ctx context.Context, httpClient *http.Client, apiBase string) (me sdkapi.User, token string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/auth/refresh", bytes.NewReader([]byte("{}")))
	if err != nil {
		return sdkapi.User{}, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return sdkapi.User{}, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return sdkapi.User{}, "", &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var parsed struct {
		User  sdkapi.User `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return sdkapi.User{}, "", err
	}
	if strings.TrimSpace(parsed.User.ID) == "" || strings.TrimSpace(parsed.Token) == "" {
		return sdkapi.User{}, "", fmt.Errorf("invalid /auth/refresh response: missing user/token")
	}

	return parsed.User, parsed.Token, nil
}
