package mew

import (
	"context"
	"net/http"

	sdkmew "mew/plugins/sdk/mew"
)

func DownloadAttachmentBytes(ctx context.Context, httpClient *http.Client, apiBase, userToken string, att Attachment, limit int64) ([]byte, error) {
	return sdkmew.DownloadAttachmentBytes(ctx, httpClient, httpClient, apiBase, userToken, att, limit)
}
