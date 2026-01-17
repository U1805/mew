package httpx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestSplitEnvList(t *testing.T) {
	got := splitEnvList(" a,b ;c \n d\t\re  a ")
	want := []string{"a", "b", "c", "d", "e"}
	if len(got) != len(want) {
		t.Fatalf("len=%d want=%d got=%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("i=%d got=%q want=%q (all=%v)", i, got[i], want[i], got)
		}
	}
}

func TestFetchProxyLists_UsesFileCache(t *testing.T) {
	tmpBase := t.TempDir()
	t.Setenv("LOCALAPPDATA", tmpBase)
	t.Setenv("APPDATA", tmpBase)
	t.Setenv("proxy_list_cache_ttl", "10m")

	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte("1.1.1.1:1080\n"))
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	got1, err := fetchProxyLists(ctx, []string{srv.URL})
	if err != nil {
		t.Fatalf("fetchProxyLists #1 err=%v", err)
	}
	if hits.Load() != 1 {
		t.Fatalf("expected 1 server hit, got %d", hits.Load())
	}
	if len(got1) != 1 || got1[0] != "1.1.1.1:1080" {
		t.Fatalf("unexpected proxies #1: %v", got1)
	}

	got2, err := fetchProxyLists(ctx, []string{srv.URL})
	if err != nil {
		t.Fatalf("fetchProxyLists #2 err=%v", err)
	}
	if hits.Load() != 1 {
		t.Fatalf("expected cache hit (still 1 server hit), got %d", hits.Load())
	}
	if len(got2) != 1 || got2[0] != "1.1.1.1:1080" {
		t.Fatalf("unexpected proxies #2: %v", got2)
	}
}

func TestFetchProxyLists_CacheExpires(t *testing.T) {
	tmpBase := t.TempDir()
	t.Setenv("LOCALAPPDATA", tmpBase)
	t.Setenv("APPDATA", tmpBase)
	t.Setenv("proxy_list_cache_ttl", "150ms")

	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte("2.2.2.2:1080\n"))
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := fetchProxyLists(ctx, []string{srv.URL}); err != nil {
		t.Fatalf("fetchProxyLists #1 err=%v", err)
	}
	if hits.Load() != 1 {
		t.Fatalf("expected 1 server hit, got %d", hits.Load())
	}

	time.Sleep(250 * time.Millisecond)

	if _, err := fetchProxyLists(ctx, []string{srv.URL}); err != nil {
		t.Fatalf("fetchProxyLists #2 err=%v", err)
	}
	if hits.Load() != 2 {
		t.Fatalf("expected cache expired (2 server hits), got %d", hits.Load())
	}
}
