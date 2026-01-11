package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"os/exec"
	"strings"
	"testing"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/sdk/client"
)

func TestBuildL5MessagesWithAttachments_IncludesStickerAsImage(t *testing.T) {
	ctx := context.Background()

	msgs := []client.ChannelMessage{
		{
			ID:        "m1",
			ChannelID: "c1",
			Type:      "message/sticker",
			Context:   "sticker: Wave",
			Payload:   json.RawMessage(`{"sticker":{"url":"http://cdn.local/sticker.png","contentType":"image/png","size":3,"name":"Wave"}}`),
			CreatedAt: time.Date(2025, 12, 31, 12, 0, 0, 0, time.UTC),
			AuthorRaw: json.RawMessage(`{"_id":"u1","username":"alice"}`),
		},
	}

	l5, err := BuildL5MessagesWithAttachments(ctx, msgs, "bot", UserContentPartsOptions{
		KeepEmptyWhenNoImages: true,
		MaxImageBytes:         1024,
		MaxTotalImageBytes:    1024,
		Download: func(ctx context.Context, att client.AttachmentRef, limit int64) ([]byte, error) {
			if att.URL != "http://cdn.local/sticker.png" {
				t.Fatalf("unexpected download url: %q", att.URL)
			}
			if att.ChannelID != "c1" {
				t.Fatalf("unexpected channelID: %q", att.ChannelID)
			}
			var buf bytes.Buffer
			if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
				t.Fatalf("png encode error: %v", err)
			}
			return buf.Bytes(), nil
		},
		Location: time.UTC,
	})
	if err != nil {
		t.Fatalf("BuildL5MessagesWithAttachments error: %v", err)
	}
	if len(l5) != 1 {
		t.Fatalf("expected 1 message, got %d", len(l5))
	}

	// Marshal and assert image_url part exists.
	b, err := json.Marshal(l5[0])
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	s := string(b)
	if !(strings.Contains(s, "\"image_url\"") || strings.Contains(s, "\"type\":\"image_url\"")) {
		t.Fatalf("expected image_url content part in message json, got: %s", s)
	}
	_, cwebpErr := exec.LookPath("cwebp")
	if cwebpErr == nil {
		if !strings.Contains(s, "data:image/webp;base64,") {
			t.Fatalf("expected data url image/webp when cwebp exists, got: %s", s)
		}
	} else {
		if !strings.Contains(s, "data:image/png;base64,") {
			t.Fatalf("expected data url image/png when cwebp missing, got: %s", s)
		}
	}

	// Ensure it's a valid union (basic sanity).
	_ = openaigo.ChatCompletionMessageParamUnion(l5[0])

	// Also ensure speaker meta tag exists (MEW-specific behavior).
	if !strings.Contains(s, "mew_speaker") {
		t.Fatalf("expected speaker meta tag in message, got: %s", s)
	}
}
