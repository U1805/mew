package llm

import (
	"encoding/json"
	"testing"
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
