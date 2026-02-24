package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type ClaudeCodeProxyClient struct {
	baseURL    string
	httpClient *http.Client
}

type claudeChatRequest struct {
	SessionID string `json:"session_id"`
	Prompt    string `json:"prompt"`
	Continue  bool   `json:"continue"`
}

type claudeChatResponse struct {
	OK     bool   `json:"ok"`
	Output string `json:"output"`
	Error  string `json:"error"`
}

func NewClaudeCodeProxyClient(baseURL string, httpClient *http.Client) (*ClaudeCodeProxyClient, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, errors.New("proxy base URL is required")
	}
	if httpClient == nil {
		return nil, errors.New("httpClient is required")
	}
	return &ClaudeCodeProxyClient{baseURL: baseURL, httpClient: httpClient}, nil
}

func (c *ClaudeCodeProxyClient) Chat(ctx context.Context, channelID, prompt string, useContinue bool) (string, error) {
	reqBody := claudeChatRequest{
		SessionID: strings.TrimSpace(channelID),
		Prompt:    strings.TrimSpace(prompt),
		Continue:  useContinue,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	var parsed claudeChatResponse
	_ = json.Unmarshal(raw, &parsed)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !parsed.OK {
		msg := strings.TrimSpace(parsed.Error)
		if msg == "" {
			msg = strings.TrimSpace(string(raw))
		}
		if msg == "" {
			msg = "claude-code proxy request failed"
		}
		return "", fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}
	return strings.TrimSpace(parsed.Output), nil
}
