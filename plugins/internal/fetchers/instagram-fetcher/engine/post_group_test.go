package engine

import (
	"testing"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
)

func TestGroupStoriesByPost(t *testing.T) {
	t.Parallel()

	in := []source.StoryItem{
		{ID: "1771757435_2", TakenAt: 1771757435},
		{ID: "1771757435_0", TakenAt: 1771757435},
		{ID: "1771757435_1", TakenAt: 1771757435},
		{ID: "1770714830_1", TakenAt: 1770714830},
		{ID: "1770714830_0", TakenAt: 1770714830},
	}

	out := groupStoriesByPost(in)
	if len(out) != 2 {
		t.Fatalf("group count=%d", len(out))
	}

	if out[0].PostID != "1771757435" {
		t.Fatalf("first post id=%q", out[0].PostID)
	}
	if len(out[0].Stories) != 3 {
		t.Fatalf("first story count=%d", len(out[0].Stories))
	}
	if out[0].Stories[0].ID != "1771757435_0" || out[0].Stories[1].ID != "1771757435_1" || out[0].Stories[2].ID != "1771757435_2" {
		t.Fatalf("first group order=%q,%q,%q", out[0].Stories[0].ID, out[0].Stories[1].ID, out[0].Stories[2].ID)
	}

	if out[1].PostID != "1770714830" {
		t.Fatalf("second post id=%q", out[1].PostID)
	}
	if len(out[1].Stories) != 2 {
		t.Fatalf("second story count=%d", len(out[1].Stories))
	}
	if out[1].Stories[0].ID != "1770714830_0" || out[1].Stories[1].ID != "1770714830_1" {
		t.Fatalf("second group order=%q,%q", out[1].Stories[0].ID, out[1].Stories[1].ID)
	}
}

func TestSplitStoryPostID(t *testing.T) {
	t.Parallel()

	if got := splitStoryPostID("1771757435_1", 0); got != "1771757435" {
		t.Fatalf("with suffix=%q", got)
	}
	if got := splitStoryPostID("1771757435", 0); got != "1771757435" {
		t.Fatalf("without suffix=%q", got)
	}
	if got := splitStoryPostID("", 1771757435); got != "1771757435" {
		t.Fatalf("fallback takenAt=%q", got)
	}
}
