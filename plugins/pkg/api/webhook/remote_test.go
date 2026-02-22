package webhook

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"testing"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func TestUploadRemote_ImagePhpFilenameNormalizedToPng(t *testing.T) {
	t.Setenv("DEV_MODE", "1")
	t.Setenv("MEW_DEV_DIR", t.TempDir())

	downloadSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/img2.php" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xd9})
	}))
	t.Cleanup(downloadSrv.Close)

	att, err := UploadRemote(
		context.Background(),
		downloadSrv.Client(),
		nil,
		"",
		"invalid-webhook-url",
		downloadSrv.URL+"/img2.php?url=encodeURIComponent(\"xxx\")",
		"fallback.png",
		"ua",
	)
	if err != nil {
		t.Fatalf("UploadRemote err=%v", err)
	}
	if got := strings.ToLower(path.Ext(att.Filename)); got != ".png" {
		t.Fatalf("expected .png filename, got filename=%q", att.Filename)
	}
}

func TestUploadRemote_ImageNoExtFilenameNormalizedToPng(t *testing.T) {
	t.Setenv("DEV_MODE", "1")
	t.Setenv("MEW_DEV_DIR", t.TempDir())

	downloadSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/image" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte{0x89, 0x50, 0x4e, 0x47})
	}))
	t.Cleanup(downloadSrv.Close)

	att, err := UploadRemote(
		context.Background(),
		downloadSrv.Client(),
		nil,
		"",
		"invalid-webhook-url",
		downloadSrv.URL+"/image",
		"fallback.png",
		"ua",
	)
	if err != nil {
		t.Fatalf("UploadRemote err=%v", err)
	}
	if got := strings.ToLower(path.Ext(att.Filename)); got != ".png" {
		t.Fatalf("expected .png filename, got filename=%q", att.Filename)
	}
}

func TestUploadRemote_RetryOnlyWithProvidedClient(t *testing.T) {
	t.Setenv("DEV_MODE", "1")
	t.Setenv("MEW_DEV_DIR", t.TempDir())

	primary := "https://pbs.twimg.com/media/a.jpg"

	var requested []string
	downloadClient := &http.Client{
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			requested = append(requested, r.URL.String())
			if len(requested) < 3 {
				return nil, timeoutErr{}
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
				Body:       io.NopCloser(bytes.NewReader([]byte{0xff, 0xd8, 0xff, 0xd9})),
				Request:    r,
			}, nil
		}),
	}

	att, err := UploadRemote(
		context.Background(),
		downloadClient,
		nil,
		"",
		"invalid-webhook-url",
		primary,
		"a.jpg",
		"ua",
	)
	if err != nil {
		t.Fatalf("UploadRemote err=%v", err)
	}
	if att.Filename != "a.jpg" {
		t.Fatalf("expected filename %q, got %q", "a.jpg", att.Filename)
	}
	if len(requested) != 3 {
		t.Fatalf("expected 3 download attempts, got %d: %v", len(requested), requested)
	}
	for i, u := range requested {
		if u != primary {
			t.Fatalf("expected attempt %d to be primary url, got %q", i, u)
		}
	}
}

func TestUploadRemote_ImageFallbackToWsrv(t *testing.T) {
	t.Setenv("DEV_MODE", "1")
	t.Setenv("MEW_DEV_DIR", t.TempDir())

	primary := "https://pbs.twimg.com/media/a.jpg"

	var requested []string
	downloadClient := &http.Client{
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			requested = append(requested, r.URL.String())
			if r.URL.Host == "wsrv.nl" {
				return &http.Response{
					StatusCode: http.StatusOK,
					Status:     "200 OK",
					Header:     http.Header{"Content-Type": []string{"image/jpeg"}},
					Body:       io.NopCloser(bytes.NewReader([]byte{0xff, 0xd8, 0xff, 0xd9})),
					Request:    r,
				}, nil
			}
			return nil, timeoutErr{}
		}),
	}

	att, err := UploadRemote(
		context.Background(),
		downloadClient,
		nil,
		"",
		"invalid-webhook-url",
		primary,
		"a.jpg",
		"ua",
	)
	if err != nil {
		t.Fatalf("UploadRemote err=%v", err)
	}
	if att.Filename != "a.jpg" {
		t.Fatalf("expected filename %q, got %q", "a.jpg", att.Filename)
	}
	if len(requested) != 4 {
		t.Fatalf("expected 4 download attempts, got %d: %v", len(requested), requested)
	}
	if !strings.HasPrefix(requested[3], "https://wsrv.nl/?url=") {
		t.Fatalf("expected last attempt to wsrv fallback, got %q", requested[3])
	}
}

func TestUploadRemote_FailsAfterRetryBudget(t *testing.T) {
	t.Setenv("DEV_MODE", "1")
	t.Setenv("MEW_DEV_DIR", t.TempDir())

	primary := "https://video.twimg.com/video/a.mp4"

	var requested []string
	downloadClient := &http.Client{
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			requested = append(requested, r.URL.String())
			return nil, timeoutErr{}
		}),
	}

	_, err := UploadRemote(
		context.Background(),
		downloadClient,
		nil,
		"",
		"invalid-webhook-url",
		primary,
		"video.mp4",
		"ua",
	)
	if err == nil {
		t.Fatalf("expected error")
	}
	if len(requested) != 3 {
		t.Fatalf("expected 3 download attempts, got %d: %v", len(requested), requested)
	}
	for i, u := range requested {
		if u != primary {
			t.Fatalf("expected attempt %d to be primary url, got %q", i, u)
		}
	}
}
