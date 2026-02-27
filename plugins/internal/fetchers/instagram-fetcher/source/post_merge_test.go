package source

import "testing"

func TestMergeStoriesByPost(t *testing.T) {
	t.Parallel()

	in := []StoryItem{
		{ID: "1771757435_2", TakenAt: 1771757435, DisplayURL: "https://example.com/2.jpg", Content: "c1"},
		{ID: "1771757435_0", TakenAt: 1771757435, DisplayURL: "https://example.com/0.jpg", Content: "c1"},
		{ID: "1771757435_1", TakenAt: 1771757435, DisplayURL: "https://example.com/1.jpg", Content: "c1"},
		{ID: "1770714830_1", TakenAt: 1770714830, DisplayURL: "https://example.com/a1.jpg", Content: "c2"},
		{ID: "1770714830_0", TakenAt: 1770714830, DisplayURL: "https://example.com/a0.jpg", Content: "c2"},
	}

	out := mergeStoriesByPost(in)
	if len(out) != 2 {
		t.Fatalf("post count=%d", len(out))
	}
	if out[0].ID != "1771757435" {
		t.Fatalf("first post id=%q", out[0].ID)
	}
	if out[0].Content != "c1" {
		t.Fatalf("first post content=%q", out[0].Content)
	}
	if len(out[0].Items) != 3 {
		t.Fatalf("first post item count=%d", len(out[0].Items))
	}
	if out[0].Items[0].ID != "1771757435_0" || out[0].Items[1].ID != "1771757435_1" || out[0].Items[2].ID != "1771757435_2" {
		t.Fatalf("first post items order=%q,%q,%q", out[0].Items[0].ID, out[0].Items[1].ID, out[0].Items[2].ID)
	}
}
