package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path"
	"regexp"
	"strings"

	"mew/plugins/pkg/api/gateway/socketio"
)

type trailingFileRef struct {
	Name string
	Path string
}

type channelUploadResponse struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
}

var (
	trailingFileRefLinePattern = regexp.MustCompile(`^\s*(\[[^\]\r\n]+\]\(([^)\r\n]+)\)\s*)+$`)
	trailingFileRefExtract     = regexp.MustCompile(`\[([^\]\r\n]+)\]\(([^)\r\n]+)\)`)
	usageFooterCalloutPattern  = regexp.MustCompile(`(?i)^>\s*\[!` + usageFooterCalloutType + `[+-]?\](?:\s|$)`)
)

func (r *ClaudeCodeRunner) emitMessageWithFileRefs(
	ctx context.Context,
	channelID, raw string,
	emit socketio.EmitFunc,
) (int, error) {
	beforeText, afterText, refs := extractFileRefSegments(raw)
	sent := 0
	if len(refs) > 0 {
		log.Printf("%s file refs detected: channel=%s count=%d", r.logPrefix, channelID, len(refs))
	}

	if strings.TrimSpace(beforeText) != "" {
		if err := emitChannelMessage(emit, channelID, beforeText); err != nil {
			return sent, err
		}
		sent++
	}

	for i, ref := range refs {
		downloadName, data, err := r.proxyClient.DownloadFile(ctx, channelID, ref.Path)
		if err != nil {
			log.Printf("%s file download failed: channel=%s ref=%q path=%q err=%v",
				r.logPrefix, channelID, ref.Name, ref.Path, err)
			msg := formatFileTransferErrorCallout("文件下载失败", ref.Name, ref.Path, err)
			if emitErr := emitChannelMessage(emit, channelID, msg); emitErr != nil {
				return sent, emitErr
			}
			sent++
			continue
		}

		outName := sanitizeAttachmentName(ref.Name, i+1)
		if strings.TrimSpace(outName) == "" {
			outName = sanitizeAttachmentName(downloadName, i+1)
		}
		if strings.TrimSpace(outName) == "" {
			outName = fmt.Sprintf("file_%d", i+1)
		}

		if err := r.sendAttachmentByBytes(ctx, channelID, outName, data); err != nil {
			msg := formatFileTransferErrorCallout("文件发送失败", ref.Name, ref.Path, err)
			if emitErr := emitChannelMessage(emit, channelID, msg); emitErr != nil {
				return sent, emitErr
			}
			sent++
			continue
		}
		log.Printf("%s file message sent: channel=%s name=%q src=%q bytes=%d",
			r.logPrefix, channelID, outName, ref.Path, len(data))
		sent++
	}

	if strings.TrimSpace(afterText) != "" {
		if err := emitChannelMessage(emit, channelID, afterText); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

func (r *ClaudeCodeRunner) sendAttachmentByBytes(ctx context.Context, channelID, filename string, data []byte) error {
	httpClient := r.session.HTTPClient()
	if httpClient == nil {
		return fmt.Errorf("missing session http client")
	}

	uploaded, err := uploadToChannel(ctx, httpClient, r.apiBase, channelID, filename, data)
	if err != nil {
		return err
	}

	reqBody := map[string]any{
		"attachments": []map[string]any{
			{
				"filename":    uploaded.Filename,
				"contentType": uploaded.ContentType,
				"key":         uploaded.Key,
				"size":        uploaded.Size,
			},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	target := strings.TrimRight(r.apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = "create attachment message failed"
		}
		return fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}
	return nil
}

func uploadToChannel(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, channelID, filename string,
	data []byte,
) (channelUploadResponse, error) {
	contentType := mime.TypeByExtension(strings.ToLower(path.Ext(filename)))
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
	h.Set("Content-Type", contentType)

	part, err := writer.CreatePart(h)
	if err != nil {
		return channelUploadResponse{}, err
	}
	if _, err := part.Write(data); err != nil {
		return channelUploadResponse{}, err
	}
	if err := writer.Close(); err != nil {
		return channelUploadResponse{}, err
	}

	target := strings.TrimRight(apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/uploads"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body.Bytes()))
	if err != nil {
		return channelUploadResponse{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return channelUploadResponse{}, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = "upload attachment failed"
		}
		return channelUploadResponse{}, fmt.Errorf("status=%d: %s", resp.StatusCode, msg)
	}

	var out channelUploadResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return channelUploadResponse{}, err
	}
	if strings.TrimSpace(out.Key) == "" {
		return channelUploadResponse{}, fmt.Errorf("upload response missing key")
	}
	if strings.TrimSpace(out.Filename) == "" {
		out.Filename = filename
	}
	if strings.TrimSpace(out.ContentType) == "" {
		out.ContentType = contentType
	}
	return out, nil
}

func extractFileRefSegments(message string) (string, string, []trailingFileRef) {
	normalized := strings.ReplaceAll(message, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) == 0 {
		return strings.TrimSpace(normalized), "", nil
	}

	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !trailingFileRefLinePattern.MatchString(trimmed) {
			continue
		}
		matches := trailingFileRefExtract.FindAllStringSubmatch(trimmed, -1)
		if len(matches) == 0 {
			continue
		}

		refs := make([]trailingFileRef, 0, len(matches))
		for _, m := range matches {
			if len(m) < 3 {
				continue
			}
			name := strings.TrimSpace(m[1])
			path := strings.TrimSpace(m[2])
			if path == "" {
				continue
			}
			refs = append(refs, trailingFileRef{Name: name, Path: path})
		}
		if len(refs) == 0 {
			continue
		}

		before := strings.TrimSpace(strings.Join(lines[:idx], "\n"))
		after := strings.TrimSpace(strings.Join(lines[idx+1:], "\n"))
		for strings.Contains(before, "\n\n\n") {
			before = strings.ReplaceAll(before, "\n\n\n", "\n\n")
		}
		for strings.Contains(after, "\n\n\n") {
			after = strings.ReplaceAll(after, "\n\n\n", "\n\n")
		}
		return before, after, refs
	}

	return strings.TrimSpace(normalized), "", nil
}

func isUsageFooterLine(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" {
		return false
	}
	if usageFooterCalloutPattern.MatchString(line) {
		return true
	}
	// Backward compatibility for old generated messages.
	return strings.HasPrefix(line, "> ⏱️") || strings.HasPrefix(line, ">⏱️")
}

func messageHasUsageFooter(msg string) bool {
	lines := strings.Split(strings.ReplaceAll(msg, "\r\n", "\n"), "\n")
	for _, line := range lines {
		if isUsageFooterLine(line) {
			return true
		}
	}
	return false
}

func formatFileTransferErrorCallout(action, name, filePath string, err error) string {
	action = strings.TrimSpace(action)
	if action == "" {
		action = "文件处理失败"
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "未命名文件"
	}
	filePath = strings.TrimSpace(filePath)
	errMsg := ""
	if err != nil {
		errMsg = strings.TrimSpace(strings.ReplaceAll(err.Error(), "\n", " "))
	}
	if errMsg == "" {
		errMsg = "未知错误"
	}

	lines := []string{
		fmt.Sprintf("> [!warning] %s", action),
		fmt.Sprintf("> 文件：`%s`", name),
	}
	if filePath != "" {
		lines = append(lines, fmt.Sprintf("> 路径：`%s`", filePath))
	}
	lines = append(lines, fmt.Sprintf("> 错误：`%s`", errMsg))
	return strings.Join(lines, "\n")
}
