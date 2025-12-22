package webhook

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFilenameFromURL(t *testing.T) {
	if got := FilenameFromURL("", "x"); got != "x" {
		t.Fatalf("expected fallback, got %q", got)
	}
	// url.Parse treats this as a relative path.
	if got := FilenameFromURL("not-a-url", "x"); got != "not-a-url" {
		t.Fatalf("unexpected filename: %q", got)
	}
	if got := FilenameFromURL("https://example.com/a/b.txt", "x"); got != "b.txt" {
		t.Fatalf("unexpected filename: %q", got)
	}
	if got := FilenameFromURL("https://example.com/", "x"); got != "x" {
		t.Fatalf("expected fallback for empty path, got %q", got)
	}
}

func TestUploadRemote_EmptyURL_NoOp(t *testing.T) {
	att, err := UploadRemote(context.Background(), nil, nil, "", "", "", "fb", "")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if att != (Attachment{}) {
		t.Fatalf("expected empty attachment, got %#v", att)
	}
}

func TestUploadRemote_DownloadAndUpload(t *testing.T) {
	t.Parallel()

	downloadSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != "ua" {
			http.Error(w, "missing ua", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("hello"))
	}))
	t.Cleanup(downloadSrv.Close)

	var gotFilename string
	var gotContentType string
	var gotBody []byte
	uploadSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mr, err := r.MultipartReader()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		part, err := mr.NextPart()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer part.Close()

		gotFilename = part.FileName()
		gotContentType = part.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(part)

		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"filename":%q,"contentType":%q,"key":"k","size":%d}`, gotFilename, gotContentType, len(gotBody))
	}))
	t.Cleanup(uploadSrv.Close)

	remoteURL := downloadSrv.URL + "/a/b.txt"
	att, err := UploadRemote(context.Background(), downloadSrv.Client(), uploadSrv.Client(), "", uploadSrv.URL, remoteURL, "fb", "ua")
	if err != nil {
		t.Fatalf("UploadRemote error: %v", err)
	}

	if gotFilename != "b.txt" {
		t.Fatalf("unexpected filename: %q", gotFilename)
	}
	wantCT := mime.TypeByExtension(".txt")
	if wantCT == "" {
		wantCT = "application/octet-stream"
	}
	if gotContentType != wantCT {
		t.Fatalf("unexpected content-type: %q, want %q", gotContentType, wantCT)
	}
	if string(gotBody) != "hello" {
		t.Fatalf("unexpected body: %q", string(gotBody))
	}
	if att.Key != "k" || att.Filename != "b.txt" || att.Size != 5 {
		t.Fatalf("unexpected attachment: %#v", att)
	}
}
