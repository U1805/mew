package engine

import (
	"testing"

	"mew/plugins/instagram-fetcher/internal/source"
)

type fakeTracker struct {
	seen map[string]bool
}

func newFakeTracker(seen ...string) *fakeTracker {
	m := map[string]bool{}
	for _, s := range seen {
		m[s] = true
	}
	return &fakeTracker{seen: m}
}

func (t *fakeTracker) IsNew(id string) bool {
	return !t.seen[id]
}

func (t *fakeTracker) MarkSeen(id string) {
	t.seen[id] = true
}

func TestStoryDedupKey_PrefersDisplayURLFilename(t *testing.T) {
	s := source.StoryItem{
		DisplayURLFilename: "abc.jpg",
		ID:                 "unstable-id",
	}
	if got := storyDedupKey(s); got != "abc.jpg" {
		t.Fatalf("storyDedupKey()=%q, want %q", got, "abc.jpg")
	}
}

func TestStorySeenKeys_ReturnsKeyAndIDWhenDifferent(t *testing.T) {
	s := source.StoryItem{
		DisplayURLFilename: "abc.jpg",
		ID:                 "unstable-id",
	}
	keys := storySeenKeys(s)
	if len(keys) != 2 || keys[0] != "abc.jpg" || keys[1] != "unstable-id" {
		t.Fatalf("storySeenKeys()=%v, want %v", keys, []string{"abc.jpg", "unstable-id"})
	}
}

func TestIsStoryNew_SeenIfEitherKeyAlreadySeen(t *testing.T) {
	story := source.StoryItem{
		DisplayURLFilename: "abc.jpg",
		ID:                 "unstable-id",
	}

	if got := isStoryNew(newFakeTracker("abc.jpg"), story); got {
		t.Fatalf("isStoryNew()=%v, want false when key already seen", got)
	}
	if got := isStoryNew(newFakeTracker("unstable-id"), story); got {
		t.Fatalf("isStoryNew()=%v, want false when id already seen", got)
	}
	if got := isStoryNew(newFakeTracker(), story); !got {
		t.Fatalf("isStoryNew()=%v, want true when neither key nor id seen", got)
	}
}

func TestMarkStorySeen_MarksKeyAndID(t *testing.T) {
	tr := newFakeTracker()
	story := source.StoryItem{
		DisplayURLFilename: "abc.jpg",
		ID:                 "unstable-id",
	}

	markStorySeen(tr, story)

	if !tr.seen["abc.jpg"] || !tr.seen["unstable-id"] {
		t.Fatalf("markStorySeen() did not mark all keys: seen=%v", tr.seen)
	}
}

