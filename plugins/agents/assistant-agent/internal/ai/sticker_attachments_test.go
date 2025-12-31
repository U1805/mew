package ai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/sdk/client"
)

func TestStickerAttachmentsFromPayload(t *testing.T) {
	b := []byte(`{"sticker":{"url":"http://cdn.local/sticker.png","contentType":"image/png","size":123,"name":"Wave"}}`)
	atts := StickerAttachmentsFromPayload("c1", json.RawMessage(b))
	if len(atts) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(atts))
	}
	if atts[0].ChannelID != "c1" {
		t.Fatalf("unexpected channelID: %q", atts[0].ChannelID)
	}
	if atts[0].URL != "http://cdn.local/sticker.png" {
		t.Fatalf("unexpected url: %q", atts[0].URL)
	}
	if atts[0].ContentType != "image/png" {
		t.Fatalf("unexpected contentType: %q", atts[0].ContentType)
	}
	if atts[0].Filename != "Wave" {
		t.Fatalf("unexpected filename: %q", atts[0].Filename)
	}
}

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
			return []byte("abc"), nil
		},
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
	if !strings.Contains(s, "data:image/png;base64,") {
		t.Fatalf("expected data url image, got: %s", s)
	}

	// Also ensure it is a user message union (basic sanity).
	_ = openaigo.ChatCompletionMessageParamUnion(l5[0])
}
