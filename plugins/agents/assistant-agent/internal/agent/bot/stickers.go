package bot

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/config"
	apistickers "mew/plugins/sdk/api/stickers"
)

type stickerCache struct {
	FetchedAt time.Time
	Stickers  []apistickers.Sticker
}

func (r *Runner) listConfiguredStickers(ctx context.Context, logPrefix string) ([]apistickers.Sticker, error) {
	now := time.Now()
	r.stickersMu.RLock()
	if !r.stickersCache.FetchedAt.IsZero() && now.Sub(r.stickersCache.FetchedAt) < config.StickerCacheTTL {
		out := append([]apistickers.Sticker(nil), r.stickersCache.Stickers...)
		r.stickersMu.RUnlock()
		return out, nil
	}
	r.stickersMu.RUnlock()

	stickers, err := apistickers.ListMyStickers(ctx, r.session.HTTPClient(), r.apiBase, "")
	if err != nil {
		log.Printf("%s sticker list fetch failed: err=%v", logPrefix, err)
		return nil, err
	}

	r.stickersMu.Lock()
	r.stickersCache = stickerCache{
		FetchedAt: now,
		Stickers:  append([]apistickers.Sticker(nil), stickers...),
	}
	r.stickersMu.Unlock()

	return stickers, nil
}

func (r *Runner) stickerPromptAddon(ctx context.Context, logPrefix string) string {
	stickers, err := r.listConfiguredStickers(ctx, logPrefix)
	if err != nil {
		return ""
	}
	if len(stickers) == 0 {
		return "(none)"
	}

	type entry struct {
		Name        string
		Description string
	}
	entries := make([]entry, 0, len(stickers))
	seen := map[string]struct{}{}
	for _, s := range stickers {
		name := strings.TrimSpace(s.Name)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		desc := strings.TrimSpace(s.Description)
		if desc != "" {
			desc = strings.Join(strings.Fields(desc), " ")
		}
		entries = append(entries, entry{Name: name, Description: desc})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
	if len(entries) == 0 {
		return "(none)"
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("stickers[%d]{id,sticker_name,description}\n", len(entries)))
	for i, e := range entries {
		b.WriteString("  ")
		b.WriteString(fmt.Sprintf("%d,", i))
		b.WriteString(e.Name)
		b.WriteString(",")
		if e.Description != "" {
			b.WriteString(e.Description)
		}
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}

func (r *Runner) resolveStickerIDByName(ctx context.Context, logPrefix, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	stickers, err := r.listConfiguredStickers(ctx, logPrefix)
	if err != nil {
		return "", err
	}

	// Case-insensitive exact match first.
	target := strings.ToLower(name)
	for _, s := range stickers {
		if strings.ToLower(strings.TrimSpace(s.Name)) == target && strings.TrimSpace(s.ID) != "" {
			return strings.TrimSpace(s.ID), nil
		}
	}

	// Fallback: substring match (first hit).
	for _, s := range stickers {
		if strings.Contains(strings.ToLower(strings.TrimSpace(s.Name)), target) && strings.TrimSpace(s.ID) != "" {
			return strings.TrimSpace(s.ID), nil
		}
	}

	return "", nil
}
