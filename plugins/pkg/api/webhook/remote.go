package webhook

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

func forceFilenameExt(filename, ext string) string {
	name := strings.TrimSpace(filename)
	if name == "" {
		name = "file"
	}
	e := strings.TrimSpace(ext)
	if e == "" {
		return name
	}
	if !strings.HasPrefix(e, ".") {
		e = "." + e
	}
	if cur := path.Ext(name); cur != "" {
		name = strings.TrimSuffix(name, cur)
	}
	return name + e
}

func isNonFileURLExt(ext string) bool {
	switch strings.ToLower(strings.TrimSpace(ext)) {
	case ".php", ".asp", ".aspx", ".cgi", ".jsp":
		return true
	default:
		return false
	}
}

func isRetryableDownloadErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return true
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	if strings.Contains(msg, "i/o timeout") {
		return true
	}
	// Windows WSA message: "An existing connection was forcibly closed by the remote host."
	// Common with public proxies.
	if strings.Contains(msg, "wsarecv") || strings.Contains(msg, "forcibly closed") {
		return true
	}
	if strings.Contains(msg, "connection reset") {
		return true
	}
	if strings.Contains(msg, "unexpected eof") || msg == "eof" {
		return true
	}
	if strings.Contains(msg, "connection refused") {
		return true
	}
	// Usually indicates a MITM/bad proxy; retry via another proxy or direct.
	if strings.Contains(msg, "x509: certificate signed by unknown authority") {
		return true
	}
	return false
}

func isLikelyImageURL(rawURL, fallbackFilename string) bool {
	ext := strings.ToLower(strings.TrimSpace(path.Ext(FilenameFromURL(rawURL, fallbackFilename))))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".avif":
		return true
	default:
		return false
	}
}

func wsrvFallbackURL(remoteURL string) string {
	u := &url.URL{
		Scheme: "https",
		Host:   "wsrv.nl",
		Path:   "/",
	}
	q := u.Query()
	q.Set("url", strings.TrimSpace(remoteURL))
	u.RawQuery = q.Encode()
	return u.String()
}

func shouldPreferDirectFallback(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" {
		return false
	}
	// Twitter media hosts.
	if strings.HasSuffix(h, ".twimg.com") {
		return true
	}
	return false
}

func directClientFrom(downloadClient *http.Client) *http.Client {
	timeout := 30 * time.Second
	var jar http.CookieJar
	if downloadClient != nil {
		if downloadClient.Timeout > 0 {
			timeout = downloadClient.Timeout
		}
		jar = downloadClient.Jar
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil // always direct, ignore env proxy
	tr.DialContext = (&net.Dialer{}).DialContext
	return &http.Client{Timeout: timeout, Transport: tr, Jar: jar}
}

// directClientFactory exists to make UploadRemote deterministic in unit tests
// (tests can override it to avoid real network access).
var directClientFactory = directClientFrom

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

	doDownload := func(client *http.Client, downloadURL string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
		if err != nil {
			return nil, err
		}
		if ua := strings.TrimSpace(userAgent); ua != "" {
			req.Header.Set("User-Agent", ua)
		}
		req.Header.Set("Accept", "*/*")
		// Force new connection per attempt to avoid getting stuck on a bad keep-alive proxy connection.
		req.Close = true
		return client.Do(req)
	}

	u, _ := url.Parse(src)
	host := ""
	if u != nil {
		host = strings.TrimSpace(u.Host)
	}

	tryClient := func(client *http.Client, downloadURL string, attempts int) (*http.Response, error) {
		var lastErr error
		for i := 0; i < attempts; i++ {
			resp, err := doDownload(client, downloadURL)
			if err == nil && resp != nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return resp, nil
			}

			// Non-2xx response: close body before retrying.
			if resp != nil {
				_ = resp.Body.Close()
				if err == nil {
					// Retry on transient HTTP statuses.
					switch resp.StatusCode {
					case http.StatusRequestTimeout, http.StatusTooManyRequests:
						err = fmt.Errorf("download failed: %s", resp.Status)
					default:
						if resp.StatusCode >= 500 && resp.StatusCode <= 599 {
							err = fmt.Errorf("download failed: %s", resp.Status)
						} else {
							// Non-retryable status (likely permanent).
							return nil, fmt.Errorf("download failed: %s", resp.Status)
						}
					}
				}
			}

			lastErr = err
			if !isRetryableDownloadErr(err) {
				return nil, err
			}

			// Small backoff to avoid hammering proxies or origin.
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(150*(i+1)) * time.Millisecond):
			}
		}
		return nil, lastErr
	}

	// 1) Try with provided download client (usually proxy-enabled).
	resp, err := tryClient(downloadClient, src, 3)
	if err != nil {
		// 2) Direct fallback (especially for static media hosts like *.twimg.com).
		directAttempts := 1
		if shouldPreferDirectFallback(host) {
			directAttempts = 2
		}
		directClient := directClientFactory(downloadClient)
		if r2, err2 := tryClient(directClient, src, directAttempts); err2 == nil {
			resp = r2
			err = nil
		} else if isRetryableDownloadErr(err) && isLikelyImageURL(src, fallbackFilename) {
			// 3) Last resort: image proxy fallback.
			fallbackURL := wsrvFallbackURL(src)
			if strings.TrimSpace(fallbackURL) != "" {
				if r3, err3 := tryClient(directClient, fallbackURL, 1); err3 == nil {
					resp = r3
					err = nil
				} else {
					return Attachment{}, fmt.Errorf("download failed: primary=%v direct=%v fallback=%w", err, err2, err3)
				}
			} else {
				return Attachment{}, fmt.Errorf("download failed: primary=%v direct=%w", err, err2)
			}
		} else {
			return Attachment{}, fmt.Errorf("download failed: primary=%v direct=%w", err, err2)
		}
	}
	if err != nil {
		return Attachment{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Attachment{}, fmt.Errorf("download failed: %s", resp.Status)
	}

	// Keep the original filename even if we downloaded through a proxy.
	filename := FilenameFromURL(src, fallbackFilename)
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(filename))
	}
	if strings.HasPrefix(contentType, "image/") {
		ext := path.Ext(filename)
		if ext == "" || isNonFileURLExt(ext) {
			filename = forceFilenameExt(filename, ".png")
		}
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
