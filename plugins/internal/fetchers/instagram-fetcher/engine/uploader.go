package engine

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
	"mew/plugins/pkg"
)

type UploadResult struct {
	DisplayKey string
	ThumbKey   string
	VideoKey   string

	ProfilePic string

	DisplayURL string
	ThumbURL   string
	VideoURL   string
	IsVideo    bool
}

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

func (u *Uploader) UploadWithCache(ctx context.Context, remoteURL, fallbackFilename string) string {
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

func (u *Uploader) ProcessAndSendStory(ctx context.Context, user *source.UserProfile, story source.StoryItem) error {
	if user == nil {
		return nil
	}

	isVideo := sdk.BoolOrDefault(story.IsVideo, false)
	displayURL := source.DecodeMediaURL(story.DisplayURL)
	thumbURL := source.DecodeMediaURL(story.ThumbnailSrc)
	videoURL := source.DecodeMediaURL(story.VideoURL)

	profilePic := source.DecodeMediaURL(user.ProfilePicURL)
	if strings.TrimSpace(profilePic) == "" {
		profilePic = source.DecodeMediaURL(user.ProfilePicURLHD)
	}

	s3Display := ""
	s3Thumb := ""
	s3Video := ""

	if isVideo {
		if strings.TrimSpace(videoURL) != "" {
			fallback := sdk.FilenameFromURL(videoURL, "video.mp4")
			if ext := path.Ext(fallback); ext == "" {
				fallback = fallback + ".mp4"
			}
			s3Video = u.UploadWithCache(ctx, videoURL, fallback)
		}
		if strings.TrimSpace(thumbURL) != "" {
			fallback := sdk.FilenameFromURL(thumbURL, "thumbnail.jpg")
			s3Thumb = u.UploadWithCache(ctx, thumbURL, fallback)
		}
	} else {
		if strings.TrimSpace(displayURL) != "" {
			fallback := strings.TrimSpace(story.DisplayURLFilename)
			if fallback == "" {
				fallback = sdk.FilenameFromURL(displayURL, "story.jpg")
			}
			if ext := path.Ext(fallback); ext == "" {
				fallback = fallback + ".jpg"
			}
			s3Display = u.UploadWithCache(ctx, displayURL, fallback)
		} else if strings.TrimSpace(thumbURL) != "" {
			fallback := sdk.FilenameFromURL(thumbURL, "story.jpg")
			s3Display = u.UploadWithCache(ctx, thumbURL, fallback)
		}
	}

	return u.SendStory(ctx, user, story, UploadResult{
		DisplayKey: s3Display,
		ThumbKey:   s3Thumb,
		VideoKey:   s3Video,
		ProfilePic: profilePic,
		DisplayURL: displayURL,
		ThumbURL:   thumbURL,
		VideoURL:   videoURL,
		IsVideo:    isVideo,
	})
}

func (u *Uploader) SendStory(ctx context.Context, user *source.UserProfile, story source.StoryItem, uploaded UploadResult) error {
	if user == nil {
		return nil
	}

	payload := map[string]any{
		"id":            strings.TrimSpace(story.ID),
		"taken_at":      story.TakenAt,
		"is_video":      uploaded.IsVideo,
		"like_count":    story.LikeCount,
		"comment_count": story.CommentCount,

		"display_url":          uploaded.DisplayURL,
		"display_url_filename": strings.TrimSpace(story.DisplayURLFilename),
		"thumbnail_src":        uploaded.ThumbURL,
		"video_url":            uploaded.VideoURL,

		"user_id":           strings.TrimSpace(user.ID),
		"username":          strings.TrimSpace(user.Username),
		"full_name":         strings.TrimSpace(user.FullName),
		"biography":         user.Biography,
		"profile_pic_url":   uploaded.ProfilePic,
		"followers_count":   user.EdgeFollowedBy,
		"following_count":   user.EdgeFollow,
		"is_verified":       user.IsVerified,
		"is_private":        user.IsPrivate,
		"external_url":      user.ExternalURL,
		"category_name":     user.CategoryName,
		"business_category": user.BusinessCategoryName,
	}
	if uploaded.DisplayKey != "" {
		payload["s3_display_url"] = uploaded.DisplayKey
	}
	if uploaded.ThumbKey != "" {
		payload["s3_thumbnail_url"] = uploaded.ThumbKey
	}
	if uploaded.VideoKey != "" {
		payload["s3_video_url"] = uploaded.VideoKey
	}

	content := fmt.Sprintf("@%s posted a new story", strings.TrimSpace(user.Username))
	msg := sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-instagram-card",
		Payload:   payload,
		Username:  strings.TrimSpace(user.FullName),
		AvatarURL: uploaded.ProfilePic,
	}
	if strings.TrimSpace(msg.Username) == "" {
		msg.Username = "@" + strings.TrimSpace(user.Username)
	}

	if err := sdk.PostWebhook(ctx, u.webhookClient, u.apiBase, u.webhookURL, msg, 3); err != nil {
		return err
	}

	log.Printf(
		"%s posted story: key=%s id=%s",
		u.logPrefix,
		strings.TrimSpace(story.DisplayURLFilename),
		strings.TrimSpace(story.ID),
	)
	return nil
}
