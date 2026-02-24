package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
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
	SessionID string `json:"session_id"`
	Filename  string `json:"filename"`
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
	OK       bool   `json:"ok"`
	Filename string `json:"filename"`
	Error    string `json:"error"`
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/files/upload", bytes.NewReader(content))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Session-Id", url.PathEscape(strings.TrimSpace(sessionID)))
	req.Header.Set("X-Filename", url.PathEscape(strings.TrimSpace(filename)))

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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/files/download", nil)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("X-Session-Id", url.PathEscape(strings.TrimSpace(sessionID)))
	req.Header.Set("X-File-Path", url.PathEscape(strings.TrimSpace(filePath)))

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
	name := parseProxyDownloadFilename(resp, filePath)
	return name, raw, nil
}

func parseProxyDownloadFilename(resp *http.Response, filePath string) string {
	fallback := path.Base(strings.TrimSpace(filePath))
	if fallback == "" || fallback == "." || fallback == "/" || fallback == `\` {
		fallback = "file"
	}

	headerName := strings.TrimSpace(resp.Header.Get("X-Claude-Filename"))
	if headerName != "" {
		if decoded, err := url.QueryUnescape(headerName); err == nil && strings.TrimSpace(decoded) != "" {
			return strings.TrimSpace(decoded)
		}
	}

	if cd := strings.TrimSpace(resp.Header.Get("Content-Disposition")); cd != "" {
		if _, params, err := mime.ParseMediaType(cd); err == nil {
			if star := strings.TrimSpace(params["filename*"]); star != "" {
				const utf8Prefix = "UTF-8''"
				value := star
				if strings.HasPrefix(strings.ToUpper(value), strings.ToUpper(utf8Prefix)) {
					value = value[len(utf8Prefix):]
				}
				if decoded, err := url.QueryUnescape(value); err == nil && strings.TrimSpace(decoded) != "" {
					return strings.TrimSpace(decoded)
				}
			}
			if plain := strings.TrimSpace(params["filename"]); plain != "" {
				return plain
			}
		}
	}

	return fallback
}
