package engine

import (
	"context"
	"log"
	"net/http"
	"strings"

	"mew/plugins/pkg"
)

type Uploader struct {
	apiBase        string
	webhookURL     string
	logPrefix      string
	downloadClient *http.Client
	uploadClient   *http.Client
}

func NewUploader(apiBase, webhookURL, logPrefix string, downloadClient, uploadClient *http.Client) *Uploader {
	return &Uploader{
		apiBase:        apiBase,
		webhookURL:     webhookURL,
		logPrefix:      logPrefix,
		downloadClient: downloadClient,
		uploadClient:   uploadClient,
	}
}

func (u *Uploader) UploadThumbnail(ctx context.Context, url string) string {
	src := strings.TrimSpace(url)
	if src == "" {
		return ""
	}
	att, err := sdk.UploadRemoteToWebhook(ctx, u.downloadClient, u.uploadClient, u.apiBase, u.webhookURL, src, "thumbnail.jpg")
	if err != nil {
		log.Printf("%s upload thumbnail failed: %v", u.logPrefix, err)
		return ""
	}
	return att.Key
}

func (u *Uploader) UploadPreview(ctx context.Context, url string) string {
	src := strings.TrimSpace(url)
	if src == "" {
		return ""
	}
	att, err := sdk.UploadRemoteToWebhook(ctx, u.downloadClient, u.uploadClient, u.apiBase, u.webhookURL, src, "preview.mp4")
	if err != nil {
		log.Printf("%s upload preview failed: %v", u.logPrefix, err)
		return ""
	}
	return att.Key
}

func (u *Uploader) UploadAvatar(ctx context.Context, url string) string {
	src := strings.TrimSpace(url)
	if src == "" {
		return ""
	}
	att, err := sdk.UploadRemoteToWebhook(ctx, u.downloadClient, u.uploadClient, u.apiBase, u.webhookURL, src, "avatar.jpg")
	if err != nil {
		log.Printf("%s upload avatar failed: %v", u.logPrefix, err)
		return ""
	}
	return att.Key
}
