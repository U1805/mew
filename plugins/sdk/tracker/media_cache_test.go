package tracker_test

import (
	"testing"

	sdktracker "mew/plugins/sdk/tracker"
)

func TestCacheMedia_EvictsFIFO(t *testing.T) {
	cache := map[string]string{}
	order := []string(nil)

	cache, order = sdktracker.CacheMedia(cache, order, " a ", "k1", 2)
	cache, order = sdktracker.CacheMedia(cache, order, "b", "k2", 2)
	cache, order = sdktracker.CacheMedia(cache, order, "c", "k3", 2)

	if _, ok := cache["a"]; ok {
		t.Fatalf("expected oldest entry to be evicted")
	}
	if cache["b"] != "k2" || cache["c"] != "k3" {
		t.Fatalf("expected remaining entries to stay")
	}
	if len(order) != 2 || order[0] != "b" || order[1] != "c" {
		t.Fatalf("unexpected order: %#v", order)
	}
}

