package webhook

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"testing"
)

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
