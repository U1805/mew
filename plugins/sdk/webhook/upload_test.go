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

	var gotUploadPath string
	var gotUploadQuery string
	var gotFilename string
	var gotPartContentType string
	var gotBody []byte
	var presignCalls int
	var uploadCalls int

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/webhooks/1/token/presign" {
			presignCalls++
			w.WriteHeader(http.StatusNotFound)
			return
		}

		uploadCalls++
		gotUploadPath = r.URL.Path
		gotUploadQuery = r.URL.RawQuery

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

	if gotUploadPath != "/api/webhooks/1/token/upload" {
		t.Fatalf("unexpected path: %q", gotUploadPath)
	}
	if gotUploadQuery != "x=1" {
		t.Fatalf("unexpected query: %q", gotUploadQuery)
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
	if presignCalls != 1 {
		t.Fatalf("expected presign to be called once, got %d", presignCalls)
	}
	if uploadCalls != 1 {
		t.Fatalf("expected multipart upload to be called once, got %d", uploadCalls)
	}
}

func TestUploadBytes_UsesPresignPutWhenAvailable(t *testing.T) {
	t.Parallel()

	var presignCalls int
	var putCalls int
	var uploadCalls int
	var gotPutBody []byte

	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/webhooks/1/token/presign":
			presignCalls++
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"key":"k1","url":"` + srv.URL + `/s3put","method":"PUT","headers":{"Content-Type":"text/plain"}}`))
			return
		case "/s3put":
			putCalls++
			b, _ := io.ReadAll(r.Body)
			gotPutBody = b
			w.WriteHeader(http.StatusOK)
			return
		case "/api/webhooks/1/token/upload":
			uploadCalls++
			w.WriteHeader(http.StatusInternalServerError)
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	t.Cleanup(srv.Close)

	webhookURL := srv.URL + "/api/webhooks/1/token"
	out, err := UploadBytes(context.Background(), srv.Client(), "", webhookURL, "hello.txt", "text/plain", []byte("hello"))
	if err != nil {
		t.Fatalf("UploadBytes error: %v", err)
	}
	if out.Key != "k1" || out.Size != int64(len("hello")) {
		t.Fatalf("unexpected response: %#v", out)
	}
	if string(gotPutBody) != "hello" {
		t.Fatalf("unexpected put body: %q", string(gotPutBody))
	}
	if presignCalls != 1 || putCalls != 1 || uploadCalls != 0 {
		t.Fatalf("calls: presign=%d put=%d upload=%d", presignCalls, putCalls, uploadCalls)
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

func TestUploadReader_RequiresFilenameAndReader(t *testing.T) {
	t.Parallel()

	_, err := UploadReader(context.Background(), nil, "", "https://example.com/webhook", "", "text/plain", strings.NewReader(""))
	if err == nil {
		t.Fatalf("expected error for empty filename")
	}

	_, err = UploadReader(context.Background(), nil, "", "https://example.com/webhook", "f.txt", "text/plain", nil)
	if err == nil {
		t.Fatalf("expected error for nil reader")
	}
}

func TestUploadReader_ErrorDecoding(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"bad"}`))
	}))
	t.Cleanup(srv.Close)

	_, err := UploadReader(context.Background(), srv.Client(), "", srv.URL, "f.txt", "text/plain", strings.NewReader("x"))
	if err == nil || err.Error() != "bad" {
		t.Fatalf("expected error %q, got %v", "bad", err)
	}
}

func TestUploadReader_ResponseMissingKey(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"filename":"f","contentType":"c","key":"","size":1}`))
	}))
	t.Cleanup(srv.Close)

	_, err := UploadReader(context.Background(), srv.Client(), "", srv.URL, "f.txt", "text/plain", strings.NewReader("x"))
	if err == nil || !strings.Contains(err.Error(), "missing key") {
		t.Fatalf("expected missing key error, got %v", err)
	}
}
