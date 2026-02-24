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

	"mew/plugins/pkg"
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
)

func (r *ClaudeCodeRunner) emitMessageWithFileRefs(
	ctx context.Context,
	channelID, raw string,
	emit socketio.EmitFunc,
) (int, error) {
	return r.emitMessageWithFileRefsDepth(ctx, channelID, raw, emit, 0)
}

func (r *ClaudeCodeRunner) emitMessageWithFileRefsDepth(
	ctx context.Context,
	channelID, raw string,
	emit socketio.EmitFunc,
	depth int,
) (int, error) {
	beforeText, afterText, refs := extractFileRefSegments(raw)
	sent := 0
	if len(refs) > 0 {
		log.Printf("%s file refs detected: channel=%s count=%d depth=%d", r.logPrefix, channelID, len(refs), depth)
	}

	if strings.TrimSpace(beforeText) != "" {
		if err := emitChannelMessage(emit, channelID, beforeText); err != nil {
			return sent, err
		}
		sent++
	}

	downloadFailures := make([]string, 0)
	for i, ref := range refs {
		downloadName, data, err := r.proxyClient.DownloadFile(ctx, channelID, ref.Path)
		if err != nil {
			downloadFailures = append(downloadFailures, fmt.Sprintf("[%s](%s): %v", ref.Name, ref.Path, err))
			log.Printf("%s file download failed: channel=%s ref=%q path=%q err=%v",
				r.logPrefix, channelID, ref.Name, ref.Path, err)
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
			msg := fmt.Sprintf("文件发送失败 [%s](%s): %v", ref.Name, ref.Path, err)
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

	if len(downloadFailures) > 0 {
		if depth < 1 {
			n, err := r.requestClaudeFixForDownloadFailures(ctx, channelID, downloadFailures, emit, depth+1)
			sent += n
			if err != nil {
				return sent, err
			}
		} else {
			log.Printf("%s file download failures remain after retry, skip user error output: channel=%s count=%d",
				r.logPrefix, channelID, len(downloadFailures))
		}
	}

	if strings.TrimSpace(afterText) != "" {
		if err := emitChannelMessage(emit, channelID, afterText); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

func (r *ClaudeCodeRunner) requestClaudeFixForDownloadFailures(
	ctx context.Context,
	channelID string,
	failures []string,
	emit socketio.EmitFunc,
	depth int,
) (int, error) {
	if len(failures) == 0 {
		return 0, nil
	}

	prompt := buildDownloadFailurePrompt(failures)
	log.Printf("%s proxy follow-up start: channel=%s mode=-c -p failure_count=%d depth=%d prompt=%q",
		r.logPrefix, channelID, len(failures), depth, sdk.PreviewString(prompt, claudeCodeLogContentPreviewLen))

	parser := NewClaudeStreamParser()
	sent := 0
	pendingMsg := ""
	pendingHasUsageFooter := false

	flushPending := func() error {
		msg := strings.TrimSpace(pendingMsg)
		if msg == "" {
			pendingMsg = ""
			pendingHasUsageFooter = false
			return nil
		}
		if pendingHasUsageFooter {
			n, err := r.emitMessageWithFileRefsDepth(ctx, channelID, msg, emit, depth)
			if err != nil {
				return err
			}
			sent += n
		} else {
			if err := emitChannelMessage(emit, channelID, msg); err != nil {
				return err
			}
			sent++
		}
		pendingMsg = ""
		pendingHasUsageFooter = false
		return nil
	}

	chunks, err := r.proxyClient.ChatStream(ctx, channelID, prompt, true, func(line string) error {
		outMsgs, parseErr := parser.FeedLine(line)
		if parseErr != nil {
			log.Printf("%s proxy follow-up chunk parse failed: channel=%s err=%v", r.logPrefix, channelID, parseErr)
			if err := flushPending(); err != nil {
				return err
			}
			if err := emitChannelMessage(emit, channelID, line); err != nil {
				return err
			}
			sent++
			return nil
		}
		for _, m := range outMsgs {
			m = strings.TrimSpace(m)
			if m == "" {
				continue
			}
			if err := flushPending(); err != nil {
				return err
			}
			pendingMsg = m
			pendingHasUsageFooter = messageHasUsageFooter(m)
		}
		return nil
	})
	if err != nil {
		log.Printf("%s proxy follow-up failed: channel=%s err=%v", r.logPrefix, channelID, err)
		return sent, err
	}
	for _, m := range parser.Flush() {
		m = strings.TrimSpace(m)
		if m == "" {
			continue
		}
		if err := flushPending(); err != nil {
			return sent, err
		}
		pendingMsg = m
		pendingHasUsageFooter = messageHasUsageFooter(m)
	}
	if err := flushPending(); err != nil {
		return sent, err
	}

	log.Printf("%s proxy follow-up success: channel=%s mode=-c -p chunks=%d messages=%d",
		r.logPrefix, channelID, chunks, sent)
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

func buildDownloadFailurePrompt(failures []string) string {
	if len(failures) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("系统通知：你上一条回复中有文件引用下载失败，用户侧未显示该错误。\n")
	b.WriteString("请基于当前会话目录检查并修正文件路径；如果仍需回传文件，请在最终回复末尾重新输出文件引用行（格式：[文件名](完整文件路径)）。\n")
	b.WriteString("以下是失败明细：\n")
	for i, f := range failures {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, f))
	}
	return strings.TrimSpace(b.String())
}
