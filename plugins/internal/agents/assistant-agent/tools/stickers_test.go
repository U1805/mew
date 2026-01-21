package tools

import (
	"testing"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
	apistickers "mew/plugins/pkg/api/stickers"
)

func TestResolveStickerIDByName_StrictExactMatchOnly(t *testing.T) {
	svc := NewStickerService()
	svc.cache = stickerCache{
		FetchedAt: time.Now(),
		Stickers: []apistickers.Sticker{
			{ID: "id-wave", Name: "Wave"},
			{ID: "id-laugh", Name: "Laugh"},
			{ID: "id-laughing", Name: "Laughing"},
		},
	}

	c := infra.MewCallContext{}

	t.Run("exact match", func(t *testing.T) {
		got, err := svc.ResolveStickerIDByName(c, "test", "Wave")
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if got != "id-wave" {
			t.Fatalf("expected id-wave, got %q", got)
		}
	})

	t.Run("case-insensitive match", func(t *testing.T) {
		got, err := svc.ResolveStickerIDByName(c, "test", "lAuGh")
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if got != "id-laugh" {
			t.Fatalf("expected id-laugh, got %q", got)
		}
	})

	t.Run("no substring fallback", func(t *testing.T) {
		got, err := svc.ResolveStickerIDByName(c, "test", "La")
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if got != "" {
			t.Fatalf("expected empty id, got %q", got)
		}
	})
}

