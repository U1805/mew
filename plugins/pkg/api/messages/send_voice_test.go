package messages

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendVoiceMessageByUploadBytes(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()

	mux.HandleFunc("/channels/ch1/uploads", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
			t.Fatalf("expected multipart content-type, got %q", r.Header.Get("Content-Type"))
		}

		mr, err := r.MultipartReader()
		if err != nil {
			t.Fatalf("multipart reader: %v", err)
		}

		p, err := mr.NextPart()
		if err != nil {
			t.Fatalf("next part: %v", err)
		}
		defer p.Close()

		if p.FormName() != "file" {
			t.Fatalf("expected form name file, got %q", p.FormName())
		}
		if p.FileName() != "voice.webm" {
			t.Fatalf("expected filename voice.webm, got %q", p.FileName())
		}

		b, _ := io.ReadAll(p)
		if string(b) != "audio-bytes" {
			t.Fatalf("unexpected upload bytes: %q", string(b))
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"filename":"voice.webm","contentType":"audio/webm","key":"k1","size":10}`))
	})

	mux.HandleFunc("/channels/ch1/messages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Fatalf("expected application/json, got %q", ct)
		}

		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode json: %v", err)
		}
		if body["type"] != "message/voice" {
			t.Fatalf("expected message/voice, got %v", body["type"])
		}
		if body["plain-text"] != "hello" {
			t.Fatalf("expected plain-text hello, got %v", body["plain-text"])
		}

		payload, ok := body["payload"].(map[string]any)
		if !ok {
			t.Fatalf("expected payload object")
		}
		voice, ok := payload["voice"].(map[string]any)
		if !ok {
			t.Fatalf("expected payload.voice object")
		}
		if voice["key"] != "k1" || voice["contentType"] != "audio/webm" {
			t.Fatalf("unexpected voice fields: %v", voice)
		}
		if voice["size"] != float64(10) {
			t.Fatalf("unexpected voice size: %v", voice["size"])
		}
		if voice["durationMs"] != float64(1234) {
			t.Fatalf("unexpected durationMs: %v", voice["durationMs"])
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"_id":"m1","channelId":"ch1","type":"message/voice","content":"","context":"voice","payload":{},"attachments":[],"mentions":[],"authorId":{"_id":"u1","username":"bot","isBot":true},"createdAt":"2026-01-19T00:00:00Z","updatedAt":"2026-01-19T00:00:00Z"}`))
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	httpClient := srv.Client()

	msg, err := SendVoiceMessageByUploadBytes(
		context.Background(),
		httpClient,
		srv.URL,
		"token",
		"ch1",
		"voice.webm",
		"audio/webm",
		[]byte("audio-bytes"),
		SendVoiceMessageOptions{PlainText: "hello", DurationMs: 1234},
	)
	if err != nil {
		t.Fatalf("send voice: %v", err)
	}
	if msg.ID != "m1" || msg.ChannelID != "ch1" || msg.Type != "message/voice" {
		t.Fatalf("unexpected message: %+v", msg)
	}
}
