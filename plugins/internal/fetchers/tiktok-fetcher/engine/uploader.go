package engine

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"

	"mew/plugins/internal/fetchers/tiktok-fetcher/source"
	"mew/plugins/pkg"
)

type Uploader struct {
	apiBase        string
	webhookURL     string
	logPrefix      string
	webhookClient  *http.Client
	downloadClient *http.Client
	uploadClient   *http.Client
	tracker        *Manager
}

func NewUploader(
	apiBase, webhookURL, logPrefix string,
	webhookClient, downloadClient, uploadClient *http.Client,
	tr *Manager,
) *Uploader {
	return &Uploader{
		apiBase:        apiBase,
		webhookURL:     webhookURL,
		logPrefix:      logPrefix,
		webhookClient:  webhookClient,
		downloadClient: downloadClient,
		uploadClient:   uploadClient,
		tracker:        tr,
	}
}

func (u *Uploader) uploadWithCache(ctx context.Context, remoteURL, fallbackFilename string) string {
	src := strings.TrimSpace(remoteURL)
	if src == "" {
		return ""
	}

	key, _, err := sdk.UploadRemoteToWebhookCached(
		ctx,
		u.tracker,
		u.downloadClient,
		u.uploadClient,
		u.apiBase,
		u.webhookURL,
		src,
		fallbackFilename,
	)
	if err != nil {
		log.Printf("%s upload media failed: url=%s err=%v", u.logPrefix, src, err)
		return ""
	}
	return key
}

func (u *Uploader) SendVideo(ctx context.Context, feed source.Feed, v source.Video) error {
	avatar := strings.TrimSpace(feed.Profile.AvatarURL)
	s3Avatar := ""
	if avatar != "" {
		s3Avatar = u.uploadWithCache(ctx, avatar, "avatar"+path.Ext(avatar))
	}

	cover := strings.TrimSpace(v.ThumbnailURL)
	s3Cover := ""
	if cover != "" {
		s3Cover = u.uploadWithCache(ctx, cover, "cover"+path.Ext(cover))
	}

	videoURL := strings.TrimSpace(v.ContentURL)
	s3Video := ""
	if videoURL != "" {
		s3Video = u.uploadWithCache(ctx, videoURL, "video.mp4")
	}

	payload := map[string]any{
		"id":          strings.TrimSpace(v.ID),
		"url":         strings.TrimSpace(v.URL),
		"title":       strings.TrimSpace(v.Title),
		"description": strings.TrimSpace(v.Description),
		"upload_date": strings.TrimSpace(v.UploadDate),
		"duration":    strings.TrimSpace(v.Duration),
		"views":       v.Views,
		"likes":       v.Likes,
		"comments":    v.Comments,
		"shares":      v.Shares,
		"width":       v.Width,
		"height":      v.Height,
		"video_url":   videoURL,
		"cover_url":   cover,

		"audio_name":   strings.TrimSpace(v.AudioName),
		"audio_author": strings.TrimSpace(v.AudioAuthor),

		"profile_name":      strings.TrimSpace(feed.Profile.Name),
		"profile_username":  strings.TrimSpace(feed.Profile.Username),
		"profile_bio":       strings.TrimSpace(feed.Profile.Bio),
		"profile_url":       strings.TrimSpace(feed.Profile.ProfileURL),
		"profile_avatar":    avatar,
		"profile_hearts":    feed.Profile.Hearts,
		"profile_followers": feed.Profile.Followers,
	}
	if s3Video != "" {
		payload["s3_video_url"] = s3Video
	}
	if s3Cover != "" {
		payload["s3_cover_url"] = s3Cover
	}
	if s3Avatar != "" {
		payload["s3_profile_avatar"] = s3Avatar
	}

	content := fmt.Sprintf("@%s posted a new TikTok video", strings.TrimSpace(feed.Profile.Username))
	if strings.TrimSpace(feed.Profile.Username) == "" {
		content = "New TikTok video"
	}
	displayName := strings.TrimSpace(feed.Profile.Name)
	if displayName == "" {
		displayName = strings.TrimSpace(feed.Profile.Username)
	}
	if displayName != "" && !strings.HasPrefix(displayName, "@") && strings.TrimSpace(feed.Profile.Name) == "" {
		displayName = "@" + displayName
	}

	avatarForMessage := avatar
	if s3Avatar != "" {
		avatarForMessage = s3Avatar
	}

	msg := sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-tiktok-card",
		Payload:   payload,
		Username:  displayName,
		AvatarURL: avatarForMessage,
	}
	if strings.TrimSpace(msg.Username) == "" {
		msg.Username = "TikTok"
	}

	if err := sdk.PostWebhook(ctx, u.webhookClient, u.apiBase, u.webhookURL, msg, 3); err != nil {
		return err
	}
	log.Printf("%s posted: %s", u.logPrefix, strings.TrimSpace(v.URL))
	return nil
}
