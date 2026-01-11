package mew

import (
	"context"
	"net/http"

	"mew/plugins/sdk/client"
)

func DownloadAttachmentBytes(ctx context.Context, httpClient *http.Client, apiBase string, att Attachment, limit int64) ([]byte, error) {
	// Use SDK-managed auth via the provided MEW HTTP client (cookie jar + auth transport).
	return client.DownloadAttachmentBytes(ctx, httpClient, httpClient, apiBase, "", att, limit)
}
