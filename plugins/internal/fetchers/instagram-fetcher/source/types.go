package source

import (
	"encoding/json"
	"net/url"
	"strings"
)

type UserProfile struct {
	Biography            string `json:"biography"`
	BusinessCategoryName string `json:"business_category_name"`
	CategoryName         string `json:"category_name"`
	ExternalURL          string `json:"external_url"`
	FullName             string `json:"full_name"`
	ID                   string `json:"id"`
	ProfilePicURL        string `json:"profile_pic_url"`
	ProfilePicURLHD      string `json:"profile_pic_url_hd"`
	Username             string `json:"username"`
	EdgeFollow           int64  `json:"edge_follow"`
	EdgeFollowedBy       int64  `json:"edge_followed_by"`
	EdgesCount           int64  `json:"edges_count"`
	IsVerified           bool   `json:"is_verified"`
	IsPrivate            bool   `json:"is_private"`
	Reels                []any  `json:"reels"`

	Edges []StoryItem `json:"-"`
}

type StoryItem struct {
	DisplayURL         string      `json:"display_url"`
	DisplayURLFilename string      `json:"display_url_filename"`
	ID                 string      `json:"id"`
	IsVideo            *bool       `json:"is_video"`
	ThumbnailSrc       string      `json:"thumbnail_src"`
	LikeCount          int64       `json:"like_count"`
	CommentCount       int64       `json:"comment_count"`
	TakenAt            int64       `json:"taken_at"`
	Title              string      `json:"title"`
	Content            string      `json:"content"`
	VideoURL           string      `json:"video_url"`
	Items              []StoryItem `json:"-"`
}

func (u *UserProfile) UnmarshalJSON(b []byte) error {
	type Alias UserProfile
	var tmp struct {
		Edges []StoryItem `json:"edges"`
		*Alias
	}
	tmp.Alias = (*Alias)(u)
	if err := json.Unmarshal(b, &tmp); err != nil {
		return err
	}
	u.Edges = tmp.Edges
	return nil
}

func DecodeMediaURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return s
	}
	return "https://cdn.iqsaved.com/img2.php?url=" + url.QueryEscape(s)
}
