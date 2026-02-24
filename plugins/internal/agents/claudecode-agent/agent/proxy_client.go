package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
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

type claudeUploadFileRequest struct {
	SessionID     string `json:"session_id"`
	Filename      string `json:"filename"`
	ContentBase64 string `json:"content_base64"`
}

type claudeUploadFileResponse struct {
	OK       bool   `json:"ok"`
	Filename string `json:"filename"`
	FilePath string `json:"file_path"`
	Error    string `json:"error"`
}

type claudeDownloadFileRequest struct {
	SessionID string `json:"session_id"`
	FilePath  string `json:"file_path"`
}

type claudeDownloadFileResponse struct {
	OK            bool   `json:"ok"`
	Filename      string `json:"filename"`
	ContentBase64 string `json:"content_base64"`
	Error         string `json:"error"`
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

func (c *ClaudeCodeProxyClient) UploadFile(
	ctx context.Context,
	sessionID, filename string,
	content []byte,
) (remotePath string, remoteFilename string, err error) {
	reqBody := claudeUploadFileRequest{
		SessionID:     strings.TrimSpace(sessionID),
		Filename:      strings.TrimSpace(filename),
		ContentBase64: base64.StdEncoding.EncodeToString(content),
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/files/upload", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = "claude-code proxy upload failed"
		}
		return "", "", fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	var out claudeUploadFileResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", "", err
	}
	if !out.OK {
		msg := strings.TrimSpace(out.Error)
		if msg == "" {
			msg = "claude-code proxy upload failed"
		}
		return "", "", errors.New(msg)
	}
	return strings.TrimSpace(out.FilePath), strings.TrimSpace(out.Filename), nil
}

func (c *ClaudeCodeProxyClient) DownloadFile(
	ctx context.Context,
	sessionID, filePath string,
) (filename string, content []byte, err error) {
	reqBody := claudeDownloadFileRequest{
		SessionID: strings.TrimSpace(sessionID),
		FilePath:  strings.TrimSpace(filePath),
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/files/download", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 16*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = "claude-code proxy download failed"
		}
		return "", nil, fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	var out claudeDownloadFileResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", nil, err
	}
	if !out.OK {
		msg := strings.TrimSpace(out.Error)
		if msg == "" {
			msg = "claude-code proxy download failed"
		}
		return "", nil, errors.New(msg)
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(out.ContentBase64))
	if err != nil {
		return "", nil, fmt.Errorf("decode download base64 failed: %w", err)
	}
	return strings.TrimSpace(out.Filename), data, nil
}
