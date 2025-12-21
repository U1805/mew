package webhook

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUploadBytes_AppendsUploadPathAndUploadsMultipart(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotQuery string
	var gotFilename string
	var gotPartContentType string
	var gotBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery

		mr, err := r.MultipartReader()
		if err != nil {
			t.Fatalf("MultipartReader: %v", err)
		}
		part, err := mr.NextPart()
		if err != nil {
			t.Fatalf("NextPart: %v", err)
		}
		defer part.Close()

		gotFilename = part.FileName()
		gotPartContentType = part.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(part)

		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"filename":%q,"contentType":%q,"key":"mock-key","size":%d}`, gotFilename, gotPartContentType, len(gotBody))
	}))
	t.Cleanup(srv.Close)

	webhookURL := srv.URL + "/api/webhooks/1/token?x=1"
	out, err := UploadBytes(context.Background(), srv.Client(), "", webhookURL, "hello.txt", "text/plain", []byte("hello"))
	if err != nil {
		t.Fatalf("UploadBytes error: %v", err)
	}

	if gotPath != "/api/webhooks/1/token/upload" {
		t.Fatalf("unexpected path: %q", gotPath)
	}
	if gotQuery != "x=1" {
		t.Fatalf("unexpected query: %q", gotQuery)
	}
	if gotFilename != "hello.txt" {
		t.Fatalf("unexpected filename: %q", gotFilename)
	}
	if gotPartContentType != "text/plain" {
		t.Fatalf("unexpected part content-type: %q", gotPartContentType)
	}
	if string(gotBody) != "hello" {
		t.Fatalf("unexpected body: %q", string(gotBody))
	}
	if out.Key != "mock-key" || out.Filename != "hello.txt" || out.ContentType != "text/plain" || out.Size != int64(len("hello")) {
		t.Fatalf("unexpected response: %#v", out)
	}
}

func TestBuildUploadURL_DoesNotDuplicate(t *testing.T) {
	t.Parallel()

	got, err := buildUploadURL("https://example.com/api/webhooks/1/token/upload")
	if err != nil {
		t.Fatalf("buildUploadURL error: %v", err)
	}
	if got != "https://example.com/api/webhooks/1/token/upload" {
		t.Fatalf("unexpected url: %q", got)
	}
}

func TestUploadReader_InvalidURL(t *testing.T) {
	t.Parallel()

	_, err := UploadReader(context.Background(), nil, "", "not-a-url", "f.txt", "text/plain", strings.NewReader(""))
	if err == nil {
		t.Fatalf("expected error")
	}
}
