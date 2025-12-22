package webhook

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestPost_RequiresContent(t *testing.T) {
	err := Post(context.Background(), nil, "", "https://example.com", Payload{Content: ""}, 1)
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestPostJSON_RewritesLoopbackToAPIBaseOrigin(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotCT string
	var gotBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotCT = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	apiBase := srv.URL + "/api"
	err := PostJSON(context.Background(), srv.Client(), apiBase, "http://localhost/webhook/abc", []byte(`{"x":1}`))
	if err != nil {
		t.Fatalf("PostJSON error: %v", err)
	}
	if gotPath != "/webhook/abc" {
		t.Fatalf("unexpected path: %q", gotPath)
	}
	if gotCT != "application/json" {
		t.Fatalf("unexpected content-type: %q", gotCT)
	}
	if strings.TrimSpace(string(gotBody)) != `{"x":1}` {
		t.Fatalf("unexpected body: %q", string(gotBody))
	}
}

func TestPostJSON_ReturnsResponseBodyMessageOnError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	err := PostJSON(context.Background(), srv.Client(), "", srv.URL, []byte(`{}`))
	if err == nil || err.Error() != "nope" {
		t.Fatalf("expected error %q, got %v", "nope", err)
	}
}

func TestPostJSONWithRetry_CancelDuringBackoff(t *testing.T) {
	var n int32
	var cancel context.CancelFunc

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&n, 1) == 1 && cancel != nil {
			cancel()
		}
		http.Error(w, "fail", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	ctx, c := context.WithCancel(context.Background())
	cancel = c

	err := PostJSONWithRetry(ctx, srv.Client(), "", srv.URL, []byte(`{}`), 3)
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context canceled, got %v", err)
	}
	if atomic.LoadInt32(&n) != 1 {
		t.Fatalf("expected exactly 1 attempt before cancel, got %d", n)
	}
}

