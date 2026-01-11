package webhook

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"mew/plugins/sdk/x/devmode"
)

// PostJSONWithRetry posts JSON to webhookURL, automatically rewriting loopback
// URLs (localhost/127.0.0.1/::1) to match apiBase's origin (useful in Docker).
//
// If attempts <= 0, it defaults to 3.
func PostJSONWithRetry(ctx context.Context, httpClient *http.Client, apiBase, webhookURL string, body []byte, attempts int) error {
	if attempts <= 0 {
		attempts = 3
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := PostJSON(ctx, httpClient, apiBase, webhookURL, body); err != nil {
			lastErr = err
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				continue
			}
		}
		return nil
	}
	return lastErr
}

func PostJSON(ctx context.Context, httpClient *http.Client, apiBase, webhookURL string, body []byte) error {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}

	target := strings.TrimSpace(webhookURL)
	if strings.TrimSpace(apiBase) != "" && strings.TrimSpace(target) != "" {
		rewritten, err := RewriteLoopbackURL(target, apiBase)
		if err != nil {
			return err
		}
		target = rewritten
	}

	if devmode.Enabled() {
		return recordWebhookJSON(apiBase, webhookURL, target, body)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(respBody))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return errors.New(msg)
	}
	return nil
}
