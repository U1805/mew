package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Payload defines the standard structure for a webhook message.
// The Content field is mandatory.
type Payload struct {
	Content   string         `json:"content"`
	Type      string         `json:"type,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
	Username  string         `json:"username,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
}

// Post sends a JSON payload to the specified webhook URL with retry logic.
func Post(ctx context.Context, httpClient *http.Client, apiBase, webhookURL string, payload Payload, maxRetries int) error {
	if payload.Content == "" {
		return fmt.Errorf("payload content is required")
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}
	return PostJSONWithRetry(ctx, httpClient, apiBase, webhookURL, b, maxRetries)
}
