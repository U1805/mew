package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
)

func TestSendStory_PayloadIncludesContentAndTitle(t *testing.T) {
	t.Parallel()

	var captured map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Fatalf("decode webhook body failed: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	u := NewUploader("", srv.URL, "[test]", srv.Client(), nil, nil, nil)
	user := &source.UserProfile{
		ID:       "6933703215",
		Username: "ringring_rin",
		FullName: "Rin Kurusu",
	}
	story := source.StoryItem{
		ID:                 "1771757435_0",
		TakenAt:            1771757435,
		Title:              "full post content",
		DisplayURLFilename: "a.jpg",
	}

	if err := u.SendStory(context.Background(), user, story, UploadResult{}); err != nil {
		t.Fatalf("SendStory failed: %v", err)
	}

	payload, ok := captured["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload missing or invalid")
	}
	if got := payload["title"]; got != "full post content" {
		t.Fatalf("payload.title = %#v", got)
	}
	if got := payload["content"]; got != "full post content" {
		t.Fatalf("payload.content = %#v", got)
	}
}

func TestProcessAndSendPost_MergesStoriesIntoSingleWebhook(t *testing.T) {
	t.Parallel()

	var captured []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode webhook body failed: %v", err)
		}
		captured = append(captured, body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	u := NewUploader("", srv.URL, "[test]", srv.Client(), nil, nil, nil)
	user := &source.UserProfile{
		ID:       "6933703215",
		Username: "ringring_rin",
		FullName: "Rin Kurusu",
	}
	stories := []source.StoryItem{
		{
			ID:                 "1771757435_1",
			TakenAt:            1771757435,
			DisplayURL:         "https://example.com/2.jpg",
			DisplayURLFilename: "2.jpg",
			Content:            "merged content",
		},
		{
			ID:                 "1771757435_0",
			TakenAt:            1771757435,
			DisplayURL:         "https://example.com/1.jpg",
			DisplayURLFilename: "1.jpg",
			Content:            "merged content",
		},
	}

	if err := u.ProcessAndSendPost(context.Background(), user, "1771757435", stories); err != nil {
		t.Fatalf("ProcessAndSendPost failed: %v", err)
	}
	if len(captured) != 1 {
		t.Fatalf("webhook calls=%d", len(captured))
	}

	payload, ok := captured[0]["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload missing or invalid")
	}
	if got := payload["id"]; got != "1771757435" {
		t.Fatalf("payload.id=%#v", got)
	}
	if got := payload["content"]; got != "merged content" {
		t.Fatalf("payload.content=%#v", got)
	}
	images, ok := payload["images"].([]any)
	if !ok || len(images) != 2 {
		t.Fatalf("payload.images=%#v", payload["images"])
	}
	if !strings.Contains(images[0].(string), "/1.jpg") {
		t.Fatalf("first image=%#v", images[0])
	}
}
