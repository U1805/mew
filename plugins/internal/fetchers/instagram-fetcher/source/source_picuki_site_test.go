package source

import (
	"encoding/json"
	"testing"
)

func TestBuildStoryItemsFromPicukiPosts_PropagatesCaptionToSidecarChildren(t *testing.T) {
	t.Parallel()

	raw := []byte(`[
		{
			"node": {
				"taken_at_timestamp": 1771757435,
				"display_url": "https://example.com/cover.jpg",
				"thumbnail_src": "https://example.com/cover.jpg",
				"is_video": false,
				"video_url": "",
				"edge_media_to_caption": {
					"edges": [
						{ "node": { "text": "sidecar full content line 1\nline 2" } }
					]
				},
				"edge_sidecar_to_children": {
					"edges": [
						{
							"node": {
								"__typename": "GraphImage",
								"display_url": "https://example.com/a.jpg",
								"thumbnail_src": "https://example.com/a.jpg",
								"is_video": false,
								"video_url": ""
							}
						},
						{
							"node": {
								"__typename": "GraphImage",
								"display_url": "https://example.com/b.jpg",
								"thumbnail_src": "https://example.com/b.jpg",
								"is_video": false,
								"video_url": ""
							}
						}
					]
				}
			}
		},
		{
			"node": {
				"taken_at_timestamp": 1771757440,
				"display_url": "https://example.com/c.jpg",
				"thumbnail_src": "https://example.com/c.jpg",
				"is_video": false,
				"video_url": "",
				"edge_media_preview_like": { "count": 7 },
				"edge_media_to_comment": { "count": 2 },
				"edge_media_to_caption": {
					"edges": [
						{ "node": { "text": "single content" } }
					]
				}
			}
		}
	]`)

	var edges []picukiPostEdge
	if err := json.Unmarshal(raw, &edges); err != nil {
		t.Fatalf("unmarshal edges failed: %v", err)
	}

	items := buildStoryItemsFromPicukiPosts(edges)
	if len(items) != 3 {
		t.Fatalf("items len = %d, want 3", len(items))
	}

	if got := items[0].Title; got != "sidecar full content line 1\nline 2" {
		t.Fatalf("items[0].Title = %q", got)
	}
	if got := items[0].Content; got != "sidecar full content line 1\nline 2" {
		t.Fatalf("items[0].Content = %q", got)
	}
	if got := items[1].Title; got != "sidecar full content line 1\nline 2" {
		t.Fatalf("items[1].Title = %q", got)
	}
	if got := items[1].Content; got != "sidecar full content line 1\nline 2" {
		t.Fatalf("items[1].Content = %q", got)
	}
	if got := items[2].Title; got != "single content" {
		t.Fatalf("items[2].Title = %q", got)
	}
	if got := items[2].Content; got != "single content" {
		t.Fatalf("items[2].Content = %q", got)
	}
}
