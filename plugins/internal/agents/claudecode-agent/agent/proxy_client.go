package agent

import (
	"bufio"
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

func (c *ClaudeCodeProxyClient) ChatStream(
	ctx context.Context,
	channelID, prompt string,
	useContinue bool,
	onChunk func(line string) error,
) (int, error) {
	reqBody := claudeChatRequest{
		SessionID: strings.TrimSpace(channelID),
		Prompt:    strings.TrimSpace(prompt),
		Continue:  useContinue,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat", bytes.NewReader(bodyBytes))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = "claude-code proxy request failed"
		}
		return 0, fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 8*1024*1024)

	count := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		count++
		if onChunk != nil {
			if err := onChunk(line); err != nil {
				return count, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return count, err
	}
	return count, nil
}
