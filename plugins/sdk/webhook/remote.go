package webhook

import (
	"context"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

// UploadRemote downloads a remote file and uploads it to the webhook /upload endpoint.
// It returns the uploaded Attachment (its Key can be used in later messages).
func UploadRemote(
	ctx context.Context,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, webhookURL, remoteURL, fallbackFilename, userAgent string,
) (Attachment, error) {
	src := strings.TrimSpace(remoteURL)
	if src == "" {
		return Attachment{}, nil
	}
	if !strings.HasPrefix(src, "http://") && !strings.HasPrefix(src, "https://") {
		return Attachment{}, fmt.Errorf("unsupported url: %q", src)
	}

	if downloadClient == nil {
		downloadClient = &http.Client{Timeout: 30 * time.Second}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return Attachment{}, err
	}
	if ua := strings.TrimSpace(userAgent); ua != "" {
		req.Header.Set("User-Agent", ua)
	}
	req.Header.Set("Accept", "*/*")

	resp, err := downloadClient.Do(req)
	if err != nil {
		return Attachment{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Attachment{}, fmt.Errorf("download failed: %s", resp.Status)
	}

	filename := FilenameFromURL(src, fallbackFilename)
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(filename))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	att, err := UploadReader(ctx, uploadClient, apiBase, webhookURL, filename, contentType, resp.Body)
	if err != nil {
		return Attachment{}, err
	}
	return att, nil
}

func FilenameFromURL(rawURL, fallback string) string {
	fb := strings.TrimSpace(fallback)
	if fb == "" {
		fb = "file"
	}
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u == nil {
		return fb
	}
	base := path.Base(u.Path)
	if base == "." || base == "/" || strings.TrimSpace(base) == "" {
		return fb
	}
	return base
}
