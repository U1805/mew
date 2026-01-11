package webhook

import (
	"context"
	"testing"
)

type testCache struct {
	m      map[string]string
	writes int
}

func (c *testCache) GetCachedMedia(remoteURL string) (string, bool) {
	if c == nil || c.m == nil {
		return "", false
	}
	v, ok := c.m[remoteURL]
	return v, ok
}

func (c *testCache) CacheMedia(remoteURL, key string) {
	if c.m == nil {
		c.m = map[string]string{}
	}
	c.m[remoteURL] = key
	c.writes++
}

func TestUploadRemoteKeyCached_UsesCache(t *testing.T) {
	c := &testCache{m: map[string]string{"https://example.com/a.png": "k1"}}
	key, used, err := UploadRemoteKeyCached(context.TODO(), c, nil, nil, "", "", "https://example.com/a.png", "a.png", "ua")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !used {
		t.Fatalf("expected usedCache=true")
	}
	if key != "k1" {
		t.Fatalf("expected key=%q, got %q", "k1", key)
	}
	if c.writes != 0 {
		t.Fatalf("expected no writes, got %d", c.writes)
	}
}

func TestUploadRemoteKeyCached_EmptyURL(t *testing.T) {
	c := &testCache{}
	key, used, err := UploadRemoteKeyCached(context.TODO(), c, nil, nil, "", "", "   ", "a.png", "ua")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if used {
		t.Fatalf("expected usedCache=false")
	}
	if key != "" {
		t.Fatalf("expected empty key, got %q", key)
	}
	if c.writes != 0 {
		t.Fatalf("expected no writes, got %d", c.writes)
	}
}
