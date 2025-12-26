package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"mew/plugins/sdk/devmode"
)

type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
}

func UploadBytes(ctx context.Context, httpClient *http.Client, apiBase, webhookURL, filename, contentType string, data []byte) (Attachment, error) {
	ct := strings.TrimSpace(contentType)
	if ct == "" {
		ct = "application/octet-stream"
	}

	// Prefer pre-signed PUT when size is known.
	if !devmode.Enabled() {
		if att, ok, err := uploadViaPresign(ctx, httpClient, apiBase, webhookURL, filename, ct, int64(len(data)), bytes.NewReader(data)); err != nil {
			return Attachment{}, err
		} else if ok {
			return att, nil
		}
	}

	// Prevent a double presign attempt inside UploadReader (bytes.Reader exposes Len()).
	return UploadReader(ctx, httpClient, apiBase, webhookURL, filename, ct, hideLen(bytes.NewReader(data)))
}

func UploadReader(ctx context.Context, httpClient *http.Client, apiBase, webhookURL, filename, contentType string, r io.Reader) (Attachment, error) {
	if strings.TrimSpace(filename) == "" {
		return Attachment{}, fmt.Errorf("filename is required")
	}
	if r == nil {
		return Attachment{}, fmt.Errorf("file reader is required")
	}

	target, err := buildUploadURL(webhookURL)
	if err != nil {
		if !devmode.Enabled() {
			return Attachment{}, err
		}
		target = ""
	}
	if strings.TrimSpace(apiBase) != "" && strings.TrimSpace(target) != "" {
		rewritten, err := RewriteLoopbackURL(target, apiBase)
		if err != nil {
			return Attachment{}, err
		}
		target = rewritten
	}

	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	}

	ct := strings.TrimSpace(contentType)
	if ct == "" {
		ct = "application/octet-stream"
	}

	// Prefer pre-signed PUT when we can infer a stable size.
	if !devmode.Enabled() {
		if size, ok := inferReaderSize(r); ok {
			if att, ok2, err := uploadViaPresign(ctx, httpClient, apiBase, webhookURL, filename, ct, size, r); err != nil {
				return Attachment{}, err
			} else if ok2 {
				return att, nil
			}
		}
	}

	if devmode.Enabled() {
		id := devmode.TimestampID()
		st := devmode.ServiceTypeFromCaller()
		safeName := devmode.SanitizeFilename(filename)
		base := st + "-" + id + "-" + safeName
		dataPath := filepath.Join(devmode.Dir(), "webhook", "upload", base)
		size, err := saveReaderAtomic(dataPath, r, 0o644)
		if err != nil {
			return Attachment{}, err
		}
		key := filepath.ToSlash(filepath.Join("dev", "webhook", "upload", filepath.Base(dataPath)))
		if err := recordUpload(apiBase, webhookURL, target, filename, ct, dataPath, size, key); err != nil {
			return Attachment{}, err
		}
		return Attachment{Filename: filename, ContentType: ct, Key: key, Size: size}, nil
	}

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	writeErrCh := make(chan error, 1)
	go func() {
		defer close(writeErrCh)

		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
		h.Set("Content-Type", ct)

		part, err := writer.CreatePart(h)
		if err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}
		if _, err := io.Copy(part, r); err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}

		if err := writer.Close(); err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}
		_ = pw.Close()
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, pr)
	if err != nil {
		_ = pw.CloseWithError(err)
		return Attachment{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return Attachment{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if err := waitWriteErr(ctx, writeErrCh); err != nil {
		return Attachment{}, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Attachment{}, decodeAPIError(body, resp.StatusCode)
	}

	var out Attachment
	if err := json.Unmarshal(body, &out); err != nil {
		return Attachment{}, fmt.Errorf("failed to decode upload response: %w (body=%s)", err, strings.TrimSpace(string(body)))
	}
	if strings.TrimSpace(out.Key) == "" {
		return Attachment{}, fmt.Errorf("upload response missing key")
	}
	return out, nil
}

func buildUploadURL(webhookURL string) (string, error) {
	raw := strings.TrimSpace(webhookURL)
	if raw == "" {
		return "", fmt.Errorf("empty webhook url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid webhook url (missing scheme/host): %q", raw)
	}

	// Append /upload to the webhook path (without duplicating).
	p := strings.TrimRight(u.Path, "/")
	if !strings.HasSuffix(p, "/upload") {
		p = p + "/upload"
	}
	u.Path = p
	u.RawPath = ""
	return u.String(), nil
}

func buildPresignURL(webhookURL string) (string, error) {
	raw := strings.TrimSpace(webhookURL)
	if raw == "" {
		return "", fmt.Errorf("empty webhook url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid webhook url (missing scheme/host): %q", raw)
	}

	p := strings.TrimRight(u.Path, "/")
	if !strings.HasSuffix(p, "/presign") {
		p = p + "/presign"
	}
	u.Path = p
	u.RawPath = ""
	return u.String(), nil
}

type presignResponse struct {
	Key     string            `json:"key"`
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

type noLenReader struct{ io.Reader }

func hideLen(r io.Reader) io.Reader { return noLenReader{Reader: r} }

func inferReaderSize(r io.Reader) (int64, bool) {
	// Common readers in the SDK path expose Len(). For non-buffered streams, size is unknown.
	type lenner interface{ Len() int }
	if v, ok := r.(lenner); ok {
		n := v.Len()
		if n > 0 {
			return int64(n), true
		}
	}
	return 0, false
}

func uploadViaPresign(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, webhookURL, filename, contentType string,
	size int64,
	r io.Reader,
) (Attachment, bool, error) {
	if size <= 0 || size > 8*1024*1024 {
		return Attachment{}, false, nil
	}

	presignURL, err := buildPresignURL(webhookURL)
	if err != nil {
		return Attachment{}, false, nil
	}
	if strings.TrimSpace(apiBase) != "" && strings.TrimSpace(presignURL) != "" {
		rewritten, err := RewriteLoopbackURL(presignURL, apiBase)
		if err != nil {
			return Attachment{}, false, err
		}
		presignURL = rewritten
	}

	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	}

	reqBody, err := json.Marshal(map[string]any{
		"filename":    filename,
		"contentType": contentType,
		"size":        size,
	})
	if err != nil {
		return Attachment{}, false, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, presignURL, bytes.NewReader(reqBody))
	if err != nil {
		return Attachment{}, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return Attachment{}, false, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Attachment{}, false, nil
	}

	var parsed presignResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Attachment{}, false, nil
	}
	if strings.TrimSpace(parsed.Key) == "" || strings.TrimSpace(parsed.URL) == "" || strings.ToUpper(strings.TrimSpace(parsed.Method)) != "PUT" {
		return Attachment{}, false, nil
	}

	putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, parsed.URL, r)
	if err != nil {
		return Attachment{}, false, err
	}
	for k, v := range parsed.Headers {
		if strings.TrimSpace(k) == "" || strings.TrimSpace(v) == "" {
			continue
		}
		putReq.Header.Set(k, v)
	}
	if putReq.Header.Get("Content-Type") == "" && strings.TrimSpace(contentType) != "" {
		putReq.Header.Set("Content-Type", contentType)
	}

	putResp, err := httpClient.Do(putReq)
	if err != nil {
		return Attachment{}, false, err
	}
	defer putResp.Body.Close()

	if putResp.StatusCode < 200 || putResp.StatusCode >= 300 {
		b, _ := io.ReadAll(putResp.Body)
		return Attachment{}, false, fmt.Errorf("presigned put failed: status=%d body=%s", putResp.StatusCode, strings.TrimSpace(string(b)))
	}

	return Attachment{Filename: filename, ContentType: contentType, Key: parsed.Key, Size: size}, true, nil
}

func waitWriteErr(ctx context.Context, ch <-chan error) error {
	select {
	case err := <-ch:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func decodeAPIError(body []byte, status int) error {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return errors.New(http.StatusText(status))
	}

	var parsed struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && strings.TrimSpace(parsed.Message) != "" {
		return errors.New(parsed.Message)
	}
	return errors.New(trimmed)
}
