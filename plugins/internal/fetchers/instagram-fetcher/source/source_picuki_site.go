package source

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	picukiBaseURL           = "https://picuki.site"
	picukiAPIBaseURL        = "https://api-wh.picuki.site/api/v1/instagram"
	picukiStaticTS    int64 = 1770118266914
	picukiStaticSV    int64 = 2
	picukiMaxClockSkewMs    = int64(60 * time.Second / time.Millisecond)
)

var picukiSigningKey = mustDecodeHex("8ee0fd249e43e00bc59d3f2acd7f02509f5cd0db0d6c54889c7c2d7c5bf8c87f")

func (c *Client) fetchPicukiPosts(ctx context.Context, httpClient *http.Client, userAgent, username string) ([]StoryItem, *UserProfile, error) {
	clockSkew, err := fetchPicukiClockSkew(ctx, httpClient, userAgent)
	if err != nil {
		return nil, nil, err
	}

	profile, err := fetchPicukiUserInfo(ctx, httpClient, userAgent, username, clockSkew)
	if err != nil {
		return nil, nil, err
	}

	posts, err := fetchPicukiPostsPage(ctx, httpClient, userAgent, username, "", clockSkew)
	if err != nil {
		return nil, nil, err
	}

	stories := buildStoryItemsFromPicukiPosts(posts.Result.Edges)
	return stories, profile, nil
}

func fetchPicukiClockSkew(ctx context.Context, httpClient *http.Client, userAgent string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, picukiBaseURL+"/msec", nil)
	if err != nil {
		return 0, err
	}
	requestHeadersPicuki(req, userAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, fmt.Errorf("picuki msec status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		Msec float64 `json:"msec"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return 0, fmt.Errorf("picuki msec decode failed: %w", err)
	}
	serverMs := int64(parsed.Msec * 1000)
	if serverMs <= 0 {
		return 0, fmt.Errorf("picuki msec invalid")
	}

	skew := time.Now().UnixMilli() - serverMs
	if absInt64(skew) < picukiMaxClockSkewMs {
		return 0, nil
	}
	return skew, nil
}

func fetchPicukiUserInfo(ctx context.Context, httpClient *http.Client, userAgent, username string, clockSkew int64) (*UserProfile, error) {
	body := map[string]any{
		"username": username,
	}

	var resp picukiUserInfoResponse
	if err := picukiSignedPost(ctx, httpClient, userAgent, "/userInfo", body, clockSkew, &resp); err != nil {
		return nil, err
	}
	if len(resp.Result) == 0 || strings.TrimSpace(resp.Result[0].User.Username) == "" {
		return nil, fmt.Errorf("picuki userInfo empty")
	}

	u := resp.Result[0].User
	profile := &UserProfile{
		Biography:       u.Biography,
		FullName:        u.FullName,
		ID:              u.ID,
		Username:        u.Username,
		ProfilePicURL:   u.ProfilePicURL,
		ProfilePicURLHD: u.HDProfilePicURLInfo.URL,
		EdgeFollow:      u.FollowingCount,
		EdgeFollowedBy:  u.FollowerCount,
		IsPrivate:       u.IsPrivate,
		IsVerified:      u.IsVerified,
	}
	return profile, nil
}

func fetchPicukiPostsPage(ctx context.Context, httpClient *http.Client, userAgent, username, maxID string, clockSkew int64) (*picukiPostsResponse, error) {
	body := map[string]any{
		"username": username,
		"maxId":    maxID,
	}
	var resp picukiPostsResponse
	if err := picukiSignedPost(ctx, httpClient, userAgent, "/postsV2", body, clockSkew, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func picukiSignedPost(ctx context.Context, httpClient *http.Client, userAgent, endpoint string, businessBody map[string]any, clockSkew int64, out any) error {
	ts := time.Now().UnixMilli() - clockSkew
	sig, err := signPicukiBody(businessBody, ts)
	if err != nil {
		return err
	}

	reqBody := cloneMap(businessBody)
	reqBody["ts"] = ts
	reqBody["_ts"] = picukiStaticTS
	reqBody["_tsc"] = clockSkew
	reqBody["_sv"] = picukiStaticSV
	reqBody["_s"] = sig

	raw, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	url := picukiAPIBaseURL + endpoint
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(raw)))
	if err != nil {
		return err
	}
	requestHeadersPicuki(req, userAgent)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/plain, */*")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("picuki %s status=%d body=%s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("picuki %s decode failed: %w", endpoint, err)
	}
	return nil
}

func requestHeadersPicuki(req *http.Request, userAgent string) {
	if req == nil {
		return
	}
	ua := strings.TrimSpace(userAgent)
	if ua == "" {
		ua = "Mozilla/5.0"
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", picukiBaseURL+"/")
	req.Header.Set("Origin", picukiBaseURL)
	req.Header.Set("Accept", "*/*")
}

func signPicukiBody(body map[string]any, ts int64) (string, error) {
	canonical, err := marshalSortedJSON(body)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, picukiSigningKey)
	_, _ = mac.Write([]byte(canonical + strconv.FormatInt(ts, 10)))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func marshalSortedJSON(m map[string]any) (string, error) {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		keyJSON, err := json.Marshal(k)
		if err != nil {
			return "", err
		}
		valueJSON, err := json.Marshal(m[k])
		if err != nil {
			return "", err
		}
		b.Write(keyJSON)
		b.WriteByte(':')
		b.Write(valueJSON)
	}
	b.WriteByte('}')
	return b.String(), nil
}

func cloneMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func buildStoryItemsFromPicukiPosts(edges []picukiPostEdge) []StoryItem {
	items := make([]StoryItem, 0, len(edges))

	for _, edge := range edges {
		n := edge.Node
		takenAt := n.TakenAtTimestamp
		if takenAt <= 0 {
			continue
		}

		if len(n.EdgeSidecarToChildren.Edges) > 0 {
			for idx, childEdge := range n.EdgeSidecarToChildren.Edges {
				item, ok := picukiNodeToStoryItem(childEdge.Node, takenAt, idx)
				if !ok {
					continue
				}
				items = append(items, item)
			}
			continue
		}

		item, ok := picukiNodeToStoryItem(picukiMediaNode{
			Typename:     n.Typename,
			DisplayURL:   n.DisplayURL,
			ThumbnailSrc: n.ThumbnailSrc,
			IsVideo:      n.IsVideo,
			VideoURL:     n.VideoURL,
		}, takenAt, 0)
		if !ok {
			continue
		}
		item.LikeCount = n.EdgeMediaPreviewLike.Count
		item.CommentCount = n.EdgeMediaToComment.Count
		item.Title = n.EdgeMediaToCaption.FirstText()
		items = append(items, item)
	}

	return items
}

func picukiNodeToStoryItem(node picukiMediaNode, takenAt int64, idx int) (StoryItem, bool) {
	display := strings.TrimSpace(node.DisplayURL)
	thumb := strings.TrimSpace(node.ThumbnailSrc)
	if display == "" && thumb == "" {
		return StoryItem{}, false
	}
	if display == "" {
		display = thumb
	}
	if thumb == "" {
		thumb = display
	}

	isVideo := node.IsVideo || strings.EqualFold(strings.TrimSpace(node.Typename), "GraphVideo")
	videoURL := strings.TrimSpace(node.VideoURL)

	return StoryItem{
		DisplayURL:         display,
		DisplayURLFilename: filenameFromURL(display),
		ID:                 fmt.Sprintf("%d_%d", takenAt, idx),
		IsVideo:            boolPtr(isVideo),
		ThumbnailSrc:       thumb,
		TakenAt:            takenAt,
		VideoURL:           videoURL,
	}, true
}

func filenameFromURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	base := path.Base(u.Path)
	if base == "." || base == "/" {
		return ""
	}
	return base
}

func boolPtr(v bool) *bool {
	b := v
	return &b
}

func mustDecodeHex(s string) []byte {
	b, err := hex.DecodeString(strings.TrimSpace(s))
	if err != nil {
		panic(err)
	}
	return b
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

type picukiUserInfoResponse struct {
	Result []struct {
		User struct {
			ID                 string `json:"id"`
			Username           string `json:"username"`
			FullName           string `json:"full_name"`
			Biography          string `json:"biography"`
			ProfilePicURL      string `json:"profile_pic_url"`
			FollowerCount      int64  `json:"follower_count"`
			FollowingCount     int64  `json:"following_count"`
			IsPrivate          bool   `json:"is_private"`
			IsVerified         bool   `json:"is_verified"`
			HDProfilePicURLInfo struct {
				URL string `json:"url"`
			} `json:"hd_profile_pic_url_info"`
		} `json:"user"`
	} `json:"result"`
}

type picukiPostsResponse struct {
	Result struct {
		Edges []picukiPostEdge `json:"edges"`
	} `json:"result"`
}

type picukiPostEdge struct {
	Node picukiPostNode `json:"node"`
}

type picukiPostNode struct {
	Typename             string `json:"__typename"`
	DisplayURL           string `json:"display_url"`
	ThumbnailSrc         string `json:"thumbnail_src"`
	IsVideo              bool   `json:"is_video"`
	VideoURL             string `json:"video_url"`
	TakenAtTimestamp     int64  `json:"taken_at_timestamp"`
	EdgeSidecarToChildren struct {
		Edges []struct {
			Node picukiMediaNode `json:"node"`
		} `json:"edges"`
	} `json:"edge_sidecar_to_children"`
	EdgeMediaPreviewLike struct {
		Count int64 `json:"count"`
	} `json:"edge_media_preview_like"`
	EdgeMediaToComment struct {
		Count int64 `json:"count"`
	} `json:"edge_media_to_comment"`
	EdgeMediaToCaption picukiCaptionEdges `json:"edge_media_to_caption"`
}

type picukiMediaNode struct {
	Typename     string `json:"__typename"`
	DisplayURL   string `json:"display_url"`
	ThumbnailSrc string `json:"thumbnail_src"`
	IsVideo      bool   `json:"is_video"`
	VideoURL     string `json:"video_url"`
}

type picukiCaptionEdges struct {
	Edges []struct {
		Node struct {
			Text string `json:"text"`
		} `json:"node"`
	} `json:"edges"`
}

func (c picukiCaptionEdges) FirstText() string {
	if len(c.Edges) == 0 {
		return ""
	}
	return strings.TrimSpace(c.Edges[0].Node.Text)
}

