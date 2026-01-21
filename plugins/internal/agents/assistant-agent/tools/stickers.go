package tools

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
	apistickers "mew/plugins/pkg/api/stickers"
)

type stickerCache struct {
	FetchedAt time.Time
	Stickers  []apistickers.Sticker
}

type StickerService struct {
	mu    sync.RWMutex
	cache stickerCache
}

func NewStickerService() *StickerService {
	return &StickerService{}
}

func (s *StickerService) listConfiguredStickers(ctx context.Context, httpClient *http.Client, apiBase string, logPrefix string) ([]apistickers.Sticker, error) {
	now := time.Now()
	s.mu.RLock()
	if !s.cache.FetchedAt.IsZero() && now.Sub(s.cache.FetchedAt) < infra.StickerCacheTTL {
		out := append([]apistickers.Sticker(nil), s.cache.Stickers...)
		s.mu.RUnlock()
		return out, nil
	}
	s.mu.RUnlock()

	if httpClient == nil {
		return nil, fmt.Errorf("missing http client")
	}

	stickers, err := apistickers.ListMyStickers(ctx, httpClient, apiBase, "")
	if err != nil {
		log.Printf("%s sticker list fetch failed: err=%v", logPrefix, err)
		return nil, err
	}

	s.mu.Lock()
	s.cache = stickerCache{
		FetchedAt: now,
		Stickers:  append([]apistickers.Sticker(nil), stickers...),
	}
	s.mu.Unlock()

	return stickers, nil
}

func (s *StickerService) StickerPromptAddon(c infra.MewCallContext, logPrefix string) string {
	ctx := infra.ContextOrBackground(c.Ctx)
	stickers, err := s.listConfiguredStickers(ctx, c.HTTPClient, c.APIBase, logPrefix)
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

func (s *StickerService) ResolveStickerIDByName(c infra.MewCallContext, logPrefix, name string) (string, error) {
	ctx := infra.ContextOrBackground(c.Ctx)

	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	stickers, err := s.listConfiguredStickers(ctx, c.HTTPClient, c.APIBase, logPrefix)
	if err != nil {
		return "", err
	}

	// Strict whitelist: only allow case-insensitive exact matches against the configured sticker list.
	// This prevents the agent from sending unintended stickers when the LLM outputs a name that isn't
	// present in the prompt's sticker table.
	target := strings.ToLower(name)
	for _, s := range stickers {
		if strings.ToLower(strings.TrimSpace(s.Name)) == target && strings.TrimSpace(s.ID) != "" {
			return strings.TrimSpace(s.ID), nil
		}
	}

	return "", nil
}
