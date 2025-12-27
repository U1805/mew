package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ChatMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type ChatCompletionsRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature *float64      `json:"temperature,omitempty"`
}

type ChatCompletionsResponse struct {
	Choices []struct {
		Message struct {
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (r ChatCompletionsResponse) FirstContent() string {
	if len(r.Choices) == 0 {
		return ""
	}
	raw := bytes.TrimSpace(r.Choices[0].Message.Content)
	if len(raw) == 0 {
		return ""
	}

	var s string
	if raw[0] == '"' {
		if err := json.Unmarshal(raw, &s); err == nil {
			return s
		}
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type != "text" || strings.TrimSpace(p.Text) == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Text)
		}
		return b.String()
	}

	return strings.TrimSpace(string(raw))
}

type ChatOptions struct {
	Path        string
	MaxRetries  int
	BaseDelay   time.Duration
	MaxDelay    time.Duration
	HTTPTimeout time.Duration
}

func (o ChatOptions) withDefaults() ChatOptions {
	if strings.TrimSpace(o.Path) == "" {
		o.Path = "/chat/completions"
	}
	if o.MaxRetries <= 0 {
		o.MaxRetries = 3
	}
	if o.BaseDelay <= 0 {
		o.BaseDelay = 800 * time.Millisecond
	}
	if o.MaxDelay <= 0 {
		o.MaxDelay = 6 * time.Second
	}
	if o.HTTPTimeout <= 0 {
		o.HTTPTimeout = 75 * time.Second
	}
	return o
}

func NewHTTPClient(opts ChatOptions) *http.Client {
	opts = opts.withDefaults()
	return &http.Client{Timeout: opts.HTTPTimeout}
}

func ChatCompletions(ctx context.Context, httpClient *http.Client, baseURL, apiKey string, req ChatCompletionsRequest, opts ChatOptions) (string, error) {
	opts = opts.withDefaults()
	if httpClient == nil {
		httpClient = NewHTTPClient(opts)
	}

	var lastErr error
	for attempt := 1; attempt <= opts.MaxRetries; attempt++ {
		out, err := chatCompletionsOnce(ctx, httpClient, baseURL, apiKey, req, opts)
		if err == nil {
			return out, nil
		}
		lastErr = err

		if attempt == opts.MaxRetries {
			break
		}

		delay := opts.BaseDelay * time.Duration(1<<(attempt-1))
		if delay > opts.MaxDelay {
			delay = opts.MaxDelay
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return "", ctx.Err()
		case <-timer.C:
		}
	}
	return "", lastErr
}

func chatCompletionsOnce(ctx context.Context, httpClient *http.Client, baseURL, apiKey string, reqBody ChatCompletionsRequest, opts ChatOptions) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("baseURL is required")
	}
	reqBody.Model = strings.TrimSpace(reqBody.Model)
	if reqBody.Model == "" {
		return "", fmt.Errorf("model is required")
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+opts.Path, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("llm status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed ChatCompletionsResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("parse llm response: %w", err)
	}
	content := strings.TrimSpace(parsed.FirstContent())
	if content == "" {
		return "", fmt.Errorf("llm returned empty content")
	}
	return content, nil
}
