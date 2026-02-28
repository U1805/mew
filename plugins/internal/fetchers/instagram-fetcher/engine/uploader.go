package engine

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
	"mew/plugins/pkg"
)

type UploadResult struct {
	DisplayKey string
	ThumbKey   string
	VideoKey   string
	ProfileKey string

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
	postID := strings.TrimSpace(story.ID)
	if postID == "" && story.TakenAt > 0 {
		postID = strconv.FormatInt(story.TakenAt, 10)
	}
	return u.ProcessAndSendPost(ctx, user, postID, []source.StoryItem{story})
}

func (u *Uploader) ProcessAndSendPost(ctx context.Context, user *source.UserProfile, postID string, stories []source.StoryItem) error {
	if user == nil {
		return nil
	}

	items := make([]source.StoryItem, 0, len(stories))
	for _, s := range stories {
		if strings.TrimSpace(s.ID) == "" && s.TakenAt <= 0 {
			continue
		}
		items = append(items, s)
	}
	if len(items) == 0 {
		return nil
	}
	sort.SliceStable(items, func(i, j int) bool {
		return storyIndexLocal(items[i].ID) < storyIndexLocal(items[j].ID)
	})
	if strings.TrimSpace(postID) == "" {
		postID = storyPostIDLocal(items[0].ID, items[0].TakenAt)
	}

	profilePic := source.DecodeMediaURL(user.ProfilePicURL)
	if strings.TrimSpace(profilePic) == "" {
		profilePic = source.DecodeMediaURL(user.ProfilePicURLHD)
	}
	s3Profile := ""
	if strings.TrimSpace(profilePic) != "" {
		fallback := sdk.FilenameFromURL(profilePic, "avatar.jpg")
		if ext := path.Ext(fallback); ext == "" {
			fallback = fallback + ".jpg"
		}
		s3Profile = u.UploadWithCache(ctx, profilePic, fallback)
	}

	takenAt := int64(0)
	likeCount := int64(0)
	commentCount := int64(0)
	storyText := ""
	displayFilename := ""

	rawImages := make([]string, 0, len(items))
	s3Images := make([]string, 0, len(items))
	storyIDs := make([]string, 0, len(items))

	rawThumb := ""
	s3Thumb := ""
	rawVideo := ""
	s3Video := ""
	isVideoPost := false

	for _, story := range items {
		if takenAt == 0 && story.TakenAt > 0 {
			takenAt = story.TakenAt
		}
		if story.LikeCount > likeCount {
			likeCount = story.LikeCount
		}
		if story.CommentCount > commentCount {
			commentCount = story.CommentCount
		}
		if strings.TrimSpace(storyText) == "" {
			storyText = pickStoryText(story)
		}
		if strings.TrimSpace(displayFilename) == "" {
			displayFilename = strings.TrimSpace(story.DisplayURLFilename)
		}
		if id := strings.TrimSpace(story.ID); id != "" {
			storyIDs = append(storyIDs, id)
		}

		isVideo := sdk.BoolOrDefault(story.IsVideo, false)
		displayURL := source.DecodeMediaURL(story.DisplayURL)
		thumbURL := source.DecodeMediaURL(story.ThumbnailSrc)
		videoURL := source.DecodeMediaURL(story.VideoURL)
		if isVideo {
			isVideoPost = true
		}

		if isVideo {
			if rawVideo == "" && strings.TrimSpace(videoURL) != "" {
				rawVideo = videoURL
				fallback := sdk.FilenameFromURL(videoURL, "video.mp4")
				if ext := path.Ext(fallback); ext == "" {
					fallback = fallback + ".mp4"
				}
				s3Video = u.UploadWithCache(ctx, videoURL, fallback)
			}
			thumbCandidate := strings.TrimSpace(thumbURL)
			if thumbCandidate == "" {
				thumbCandidate = strings.TrimSpace(displayURL)
			}
			if rawThumb == "" && thumbCandidate != "" {
				rawThumb = thumbCandidate
				fallback := sdk.FilenameFromURL(thumbCandidate, "thumbnail.jpg")
				s3Thumb = u.UploadWithCache(ctx, thumbCandidate, fallback)
			}
			continue
		}

		imageURL := strings.TrimSpace(displayURL)
		if imageURL == "" {
			imageURL = strings.TrimSpace(thumbURL)
		}
		if imageURL == "" {
			continue
		}
		appendUniqueString(&rawImages, imageURL)

		fallback := strings.TrimSpace(story.DisplayURLFilename)
		if fallback == "" {
			fallback = sdk.FilenameFromURL(imageURL, "story.jpg")
		}
		if ext := path.Ext(fallback); ext == "" {
			fallback = fallback + ".jpg"
		}
		if key := u.UploadWithCache(ctx, imageURL, fallback); key != "" {
			appendUniqueString(&s3Images, key)
		}
	}

	rawDisplay := ""
	if len(rawImages) > 0 {
		rawDisplay = rawImages[0]
	}
	s3Display := ""
	if len(s3Images) > 0 {
		s3Display = s3Images[0]
	}
	if rawDisplay == "" && rawThumb != "" {
		rawDisplay = rawThumb
	}
	if strings.TrimSpace(displayFilename) == "" {
		displayFilename = sdk.FilenameFromURL(rawDisplay, "story.jpg")
	}

	payload := map[string]any{
		"id":                   strings.TrimSpace(postID),
		"story_ids":            storyIDs,
		"media_count":          len(items),
		"taken_at":             takenAt,
		"is_video":             rawVideo != "" || isVideoPost,
		"like_count":           likeCount,
		"comment_count":        commentCount,
		"title":                storyText,
		"content":              storyText,
		"display_url":          rawDisplay,
		"display_url_filename": strings.TrimSpace(displayFilename),
		"thumbnail_src":        rawThumb,
		"video_url":            rawVideo,
		"images":               rawImages,
		"user_id":              strings.TrimSpace(user.ID),
		"username":             strings.TrimSpace(user.Username),
		"full_name":            strings.TrimSpace(user.FullName),
		"biography":            user.Biography,
		"profile_pic_url":      profilePic,
		"followers_count":      user.EdgeFollowedBy,
		"following_count":      user.EdgeFollow,
		"is_verified":          user.IsVerified,
		"is_private":           user.IsPrivate,
		"external_url":         user.ExternalURL,
		"category_name":        user.CategoryName,
		"business_category":    user.BusinessCategoryName,
	}
	if len(s3Images) > 0 {
		payload["s3_images"] = s3Images
	}
	if s3Display != "" {
		payload["s3_display_url"] = s3Display
	}
	if s3Thumb != "" {
		payload["s3_thumbnail_url"] = s3Thumb
	}
	if s3Video != "" {
		payload["s3_video_url"] = s3Video
	}
	if s3Profile != "" {
		payload["s3_profile_pic_url"] = s3Profile
	}

	content := fmt.Sprintf("@%s posted a new story", strings.TrimSpace(user.Username))
	avatarURL := profilePic
	if s3Profile != "" {
		avatarURL = s3Profile
	}
	msg := sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-instagram-card",
		Payload:   payload,
		Username:  strings.TrimSpace(user.FullName),
		AvatarURL: avatarURL,
	}
	if strings.TrimSpace(msg.Username) == "" {
		msg.Username = "@" + strings.TrimSpace(user.Username)
	}

	if err := sdk.PostWebhook(ctx, u.webhookClient, u.apiBase, u.webhookURL, msg, 3); err != nil {
		return err
	}
	log.Printf("%s posted story post: id=%s media=%d", u.logPrefix, strings.TrimSpace(postID), len(items))
	return nil
}

func (u *Uploader) SendStory(ctx context.Context, user *source.UserProfile, story source.StoryItem, uploaded UploadResult) error {
	if user == nil {
		return nil
	}
	storyText := pickStoryText(story)

	payload := map[string]any{
		"id":            strings.TrimSpace(story.ID),
		"taken_at":      story.TakenAt,
		"is_video":      uploaded.IsVideo,
		"like_count":    story.LikeCount,
		"comment_count": story.CommentCount,
		"title":         storyText,
		"content":       storyText,

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
	if uploaded.ProfileKey != "" {
		payload["s3_profile_pic_url"] = uploaded.ProfileKey
	}

	content := fmt.Sprintf("@%s posted a new story", strings.TrimSpace(user.Username))
	avatarURL := uploaded.ProfilePic
	if uploaded.ProfileKey != "" {
		avatarURL = uploaded.ProfileKey
	}
	msg := sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-instagram-card",
		Payload:   payload,
		Username:  strings.TrimSpace(user.FullName),
		AvatarURL: avatarURL,
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

func appendUniqueString(arr *[]string, value string) {
	v := strings.TrimSpace(value)
	if v == "" {
		return
	}
	for _, existing := range *arr {
		if strings.TrimSpace(existing) == v {
			return
		}
	}
	*arr = append(*arr, v)
}

func pickStoryText(story source.StoryItem) string {
	if s := strings.TrimSpace(story.Content); s != "" {
		return s
	}
	return strings.TrimSpace(story.Title)
}

func storyPostIDLocal(storyID string, takenAt int64) string {
	id := strings.TrimSpace(storyID)
	if id != "" {
		if idx := strings.Index(id, "_"); idx > 0 {
			return strings.TrimSpace(id[:idx])
		}
		return id
	}
	if takenAt > 0 {
		return strconv.FormatInt(takenAt, 10)
	}
	return ""
}

func storyIndexLocal(storyID string) int {
	id := strings.TrimSpace(storyID)
	if id == "" {
		return 0
	}
	idx := strings.Index(id, "_")
	if idx < 0 || idx+1 >= len(id) {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(id[idx+1:]))
	if err != nil || n < 0 {
		return 0
	}
	return n
}
