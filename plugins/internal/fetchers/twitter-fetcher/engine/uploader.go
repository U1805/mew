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
	"time"

	"mew/plugins/internal/fetchers/twitter-fetcher/source"
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
	src := NormalizeMediaURL(remoteURL)
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

func (u *Uploader) SendTweet(ctx context.Context, tl source.Timeline, wrapper source.Tweet) error {
	display := wrapper
	isRetweet := false
	if wrapper.RetweetedTweet != nil && strings.TrimSpace(wrapper.RetweetedTweet.RestID) != "" {
		display = *wrapper.RetweetedTweet
		isRetweet = true
	}

	author := tl.Users[display.UserID]
	if strings.TrimSpace(author.Handle) == "" {
		author = tl.Users[wrapper.UserID]
	}
	author = enrichAuthorFromUserKey(author, display.UserID)
	if strings.TrimSpace(author.Handle) == "" {
		author = enrichAuthorFromUserKey(author, wrapper.UserID)
	}

	tweetURL := BuildTweetURL(tl.Users, display.UserID, display.RestID)
	if tweetURL == "" {
		tweetURL = BuildTweetURL(tl.Users, wrapper.UserID, wrapper.RestID)
	}

	text := BuildTweetText(display)
	authorAvatar := NormalizeMediaURL(author.ProfileImageURL)
	s3AuthorAvatar := ""
	if authorAvatar != "" {
		s3AuthorAvatar = u.uploadWithCache(ctx, authorAvatar, "avatar"+path.Ext(authorAvatar))
	}

	s3Images := make([]string, 0, len(display.Images))
	images := make([]string, 0, len(display.Images))
	for _, img := range display.Images {
		norm := NormalizeMediaURL(img)
		if norm != "" {
			images = append(images, norm)
		}
		key := u.uploadWithCache(ctx, norm, "image"+path.Ext(norm))
		if key != "" {
			s3Images = append(s3Images, key)
		}
	}

	videoURL, videoCT := PickBestVideoURL(display.Video)
	videoURL = NormalizeMediaURL(videoURL)
	s3Video := ""
	coverURL := ""
	s3Cover := ""
	if display.Video != nil {
		coverURL = NormalizeMediaURL(display.Video.CoverURL)
		if coverURL != "" {
			s3Cover = u.uploadWithCache(ctx, coverURL, "cover"+path.Ext(coverURL))
		}
		if strings.TrimSpace(videoURL) != "" {
			s3Video = u.uploadWithCache(ctx, videoURL, "video.mp4")
		}
	}

	payload := map[string]any{
		"id":            wrapper.RestID,
		"url":           tweetURL,
		"text":          text,
		"created_at":    display.CreatedAt,
		"is_retweet":    isRetweet,
		"author_name":   author.Name,
		"author_handle": author.Handle,
		"author_avatar": authorAvatar,
		"images":        images,
		"video_url":     videoURL,
		"cover_url":     coverURL,
		"like_count":    display.FavoriteCount,
		"retweet_count": display.RetweetCount,
		"reply_count":   display.ReplyCount,
		"quote_count":   display.QuoteCount,
		"view_count":    SafeInt64ToString(display.ViewCount),
	}
	if len(s3Images) > 0 {
		payload["s3_images"] = s3Images
	}
	if s3AuthorAvatar != "" {
		payload["s3_author_avatar"] = s3AuthorAvatar
	}
	if s3Cover != "" {
		payload["s3_cover_url"] = s3Cover
	}
	if s3Video != "" {
		payload["s3_video_url"] = s3Video
		payload["video_content_type"] = videoCT
	}
	if display.QuotedTweet != nil && strings.TrimSpace(display.QuotedTweet.RestID) != "" {
		payload["quoted_tweet"] = u.buildTweetCardPayload(ctx, tl, *display.QuotedTweet)
	}

	content := text
	if isRetweet && strings.TrimSpace(author.Handle) != "" {
		content = fmt.Sprintf("RT @%s: %s", author.Handle, text)
	}
	if len([]rune(content)) > 180 {
		content = string([]rune(content)[:180]) + "…"
	}

	avatarURL := NormalizeMediaURL(tl.MonitoredUser.ProfileImageURL)
	if key := u.uploadWithCache(ctx, avatarURL, "avatar"+path.Ext(avatarURL)); key != "" {
		avatarURL = key
	}

	msg := sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-twitter-card",
		Payload:   payload,
		Username:  tl.MonitoredUser.Name,
		AvatarURL: avatarURL,
	}

	if err := sdk.PostWebhook(ctx, u.webhookClient, u.apiBase, u.webhookURL, msg, 3); err != nil {
		return err
	}
	log.Printf("%s posted: %s", u.logPrefix, tweetURL)
	return nil
}

func (u *Uploader) buildTweetCardPayload(ctx context.Context, tl source.Timeline, t source.Tweet) map[string]any {
	author := tl.Users[t.UserID]
	author = enrichAuthorFromUserKey(author, t.UserID)

	tweetURL := BuildTweetURL(tl.Users, t.UserID, t.RestID)
	text := BuildTweetText(t)
	authorAvatar := NormalizeMediaURL(author.ProfileImageURL)
	s3AuthorAvatar := ""
	if authorAvatar != "" {
		s3AuthorAvatar = u.uploadWithCache(ctx, authorAvatar, "avatar"+path.Ext(authorAvatar))
	}

	s3Images := make([]string, 0, len(t.Images))
	images := make([]string, 0, len(t.Images))
	for _, img := range t.Images {
		norm := NormalizeMediaURL(img)
		if norm != "" {
			images = append(images, norm)
		}
		key := u.uploadWithCache(ctx, norm, "image"+path.Ext(norm))
		if key != "" {
			s3Images = append(s3Images, key)
		}
	}

	videoURL, videoCT := PickBestVideoURL(t.Video)
	videoURL = NormalizeMediaURL(videoURL)
	s3Video := ""
	coverURL := ""
	s3Cover := ""
	if t.Video != nil {
		coverURL = NormalizeMediaURL(t.Video.CoverURL)
		if coverURL != "" {
			s3Cover = u.uploadWithCache(ctx, coverURL, "cover"+path.Ext(coverURL))
		}
		if strings.TrimSpace(videoURL) != "" {
			s3Video = u.uploadWithCache(ctx, videoURL, "video.mp4")
		}
	}

	out := map[string]any{
		"id":            t.RestID,
		"url":           tweetURL,
		"text":          text,
		"created_at":    t.CreatedAt,
		"author_name":   author.Name,
		"author_handle": author.Handle,
		"author_avatar": authorAvatar,
		"images":        images,
		"video_url":     videoURL,
		"cover_url":     coverURL,
		"like_count":    t.FavoriteCount,
		"retweet_count": t.RetweetCount,
		"reply_count":   t.ReplyCount,
		"quote_count":   t.QuoteCount,
		"view_count":    SafeInt64ToString(t.ViewCount),
	}
	if len(s3Images) > 0 {
		out["s3_images"] = s3Images
	}
	if s3AuthorAvatar != "" {
		out["s3_author_avatar"] = s3AuthorAvatar
	}
	if s3Cover != "" {
		out["s3_cover_url"] = s3Cover
	}
	if s3Video != "" {
		out["s3_video_url"] = s3Video
		out["video_content_type"] = videoCT
	}
	return out
}

func TweetCreatedAt(twitterCreatedAt string) time.Time {
	s := strings.TrimSpace(twitterCreatedAt)
	if s == "" {
		return time.Time{}
	}
	tt, err := time.Parse(time.RubyDate, s)
	if err != nil {
		return time.Time{}
	}
	return tt
}

func BuildTweetURL(users map[string]source.User, userID, tweetID string) string {
	tweetID = strings.TrimSpace(tweetID)
	if tweetID == "" {
		return ""
	}

	handle := strings.TrimSpace(userID)
	if usr, ok := users[userID]; ok && strings.TrimSpace(usr.Handle) != "" {
		handle = usr.Handle
	}
	handle = strings.TrimSpace(handle)
	if handle != "" {
		if _, err := strconv.ParseInt(handle, 10, 64); err == nil {
			return fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
		}
		return fmt.Sprintf("https://x.com/%s/status/%s", handle, tweetID)
	}
	return fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
}

func enrichAuthorFromUserKey(author source.User, userID string) source.User {
	if strings.TrimSpace(author.Handle) != "" {
		if strings.TrimSpace(author.Name) == "" {
			author.Name = strings.TrimSpace(author.Handle)
		}
		return author
	}

	uid := strings.TrimSpace(userID)
	if uid == "" {
		return author
	}
	if _, err := strconv.ParseInt(uid, 10, 64); err == nil {
		return author
	}
	handle := uid
	if handle == "" {
		return author
	}
	author.Handle = handle
	if strings.TrimSpace(author.Name) == "" {
		author.Name = handle
	}
	return author
}

func PickBestVideoURL(v *source.Video) (videoURL string, contentType string) {
	if v == nil {
		return "", ""
	}
	if strings.TrimSpace(v.VideoURL) != "" {
		return strings.TrimSpace(v.VideoURL), "video/mp4"
	}

	type cand struct {
		bitrate int64
		url     string
		ct      string
	}
	cands := make([]cand, 0, len(v.Variants))
	for _, vv := range v.Variants {
		if strings.TrimSpace(vv.URL) == "" {
			continue
		}
		if strings.TrimSpace(vv.ContentType) != "video/mp4" {
			continue
		}
		br := int64(0)
		if vv.Bitrate != nil {
			br = *vv.Bitrate
		}
		cands = append(cands, cand{bitrate: br, url: vv.URL, ct: vv.ContentType})
	}
	if len(cands) == 0 {
		return "", ""
	}

	sort.SliceStable(cands, func(i, j int) bool { return cands[i].bitrate < cands[j].bitrate })
	target := int64(2_500_000)
	bestIdx := 0
	bestDist := int64(1<<63 - 1)
	for i, c := range cands {
		if c.bitrate == 0 {
			continue
		}
		dist := c.bitrate - target
		if dist < 0 {
			dist = -dist
		}
		if dist < bestDist {
			bestDist = dist
			bestIdx = i
		}
	}
	return strings.TrimSpace(cands[bestIdx].url), "video/mp4"
}

func SafeInt64ToString(v *int64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatInt(*v, 10)
}

func BuildTweetText(t source.Tweet) string {
	text := strings.TrimSpace(t.FullText)
	if text == "" {
		text = strings.TrimSpace(t.DisplayText)
	}
	return text
}
