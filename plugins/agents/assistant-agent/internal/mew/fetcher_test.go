package mew

import (
	"testing"
	"time"
)

func TestFilterRetractedMessages(t *testing.T) {
	now := time.Now()
	msgs := []Message{
		{ID: "m1"},
		{ID: "m2", RetractedAt: &now},
		{ID: "m3"},
	}

	out := filterRetractedMessages(msgs)
	if len(out) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(out))
	}
	if out[0].ID != "m1" || out[1].ID != "m3" {
		t.Fatalf("unexpected ids: %q, %q", out[0].ID, out[1].ID)
	}
}
