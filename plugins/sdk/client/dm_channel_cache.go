package client

import (
	"context"
	"net/http"
	"strings"
	"sync"
)

type DMChannelCache struct {
	mu       sync.RWMutex
	channels map[string]struct{}
}

func NewDMChannelCache() *DMChannelCache {
	return &DMChannelCache{channels: map[string]struct{}{}}
}

func (c *DMChannelCache) Has(channelID string) bool {
	if c == nil {
		return false
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return false
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.channels[channelID]
	return ok
}

func (c *DMChannelCache) Refresh(ctx context.Context, httpClient *http.Client, apiBase, userToken string) error {
	if c == nil {
		return nil
	}
	dm, err := FetchDMChannels(ctx, httpClient, apiBase, userToken)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.channels = dm
	c.mu.Unlock()
	return nil
}
