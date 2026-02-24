package auth

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	sdkapi "mew/plugins/pkg/api"
)

const (
	csrfCookieName = "mew_csrf_token"
	csrfHeaderName = "X-Mew-Csrf-Token"
)

func ensureCsrfToken(ctx context.Context, httpClient *http.Client, apiBase string) (string, error) {
	if httpClient == nil {
		return "", fmt.Errorf("httpClient is required")
	}
	baseURL, err := parseAPIBaseURL(apiBase)
	if err != nil {
		return "", err
	}

	if token := readCSRFCookie(httpClient, baseURL); token != "" {
		return token, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL.String()+"/auth/csrf", nil)
	if err != nil {
		return "", err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: "failed to fetch csrf token"}
	}

	token := readCSRFCookie(httpClient, baseURL)
	if token == "" {
		return "", fmt.Errorf("csrf token cookie not found after /auth/csrf")
	}
	return token, nil
}

func parseAPIBaseURL(apiBase string) (*url.URL, error) {
	base := strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if base == "" {
		return nil, fmt.Errorf("apiBase is required")
	}
	u, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func readCSRFCookie(httpClient *http.Client, baseURL *url.URL) string {
	if httpClient == nil || httpClient.Jar == nil || baseURL == nil {
		return ""
	}
	for _, c := range httpClient.Jar.Cookies(baseURL) {
		if strings.TrimSpace(c.Name) != csrfCookieName {
			continue
		}
		v := strings.TrimSpace(c.Value)
		if v != "" {
			return v
		}
	}
	return ""
}
