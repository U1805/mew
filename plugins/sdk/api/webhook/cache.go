package webhook

import (
	"context"
	"net/http"
	"strings"
)

// MediaCache is a minimal interface used by plugins to cache remote media uploads.
// Implementations usually store remoteURL -> attachment key in the task state.
type MediaCache interface {
	GetCachedMedia(remoteURL string) (key string, ok bool)
	CacheMedia(remoteURL, key string)
}

// UploadRemoteKeyCached downloads and uploads a remote file to the webhook endpoint.
// If cache contains a non-empty key for the given URL, it returns that key without uploading.
//
// Returns (key, usedCache, err).
func UploadRemoteKeyCached(
	ctx context.Context,
	cache MediaCache,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, webhookURL, remoteURL, fallbackFilename, userAgent string,
) (string, bool, error) {
	src := strings.TrimSpace(remoteURL)
	if src == "" {
		return "", false, nil
	}

	if cache != nil {
		if key, ok := cache.GetCachedMedia(src); ok && strings.TrimSpace(key) != "" {
			return strings.TrimSpace(key), true, nil
		}
	}

	att, err := UploadRemote(ctx, downloadClient, uploadClient, apiBase, webhookURL, src, fallbackFilename, userAgent)
	if err != nil {
		return "", false, err
	}
	key := strings.TrimSpace(att.Key)
	if cache != nil && key != "" {
		cache.CacheMedia(src, key)
	}
	return key, false, nil
}
