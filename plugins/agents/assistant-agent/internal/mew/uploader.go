package mew

import (
	"context"
	"net/http"

	"mew/plugins/sdk/client"
)

func DownloadAttachmentBytes(ctx context.Context, httpClient *http.Client, apiBase, userToken string, att Attachment, limit int64) ([]byte, error) {
	return client.DownloadAttachmentBytes(ctx, httpClient, httpClient, apiBase, userToken, att, limit)
}
