package source

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const (
	imginnBaseURL              = "https://imginn.com"
	flareSolverrEnvURL         = "FLARESOLVERR_URL"
	flareSolverrRequestTimeout = 130 * time.Second
)

type flareSolverrRequest struct {
	Cmd        string `json:"cmd"`
	URL        string `json:"url"`
	MaxTimeout int    `json:"maxTimeout,omitempty"`
}

type flareSolverrResponse struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	Solution struct {
		URL      string `json:"url"`
		Status   int    `json:"status"`
		Response string `json:"response"`
	} `json:"solution"`
}

func (c *Client) fetchImginn(ctx context.Context, httpClient *http.Client, userAgent, username string) ([]StoryItem, *UserProfile, error) {
	endpoint := strings.TrimSpace(getFlareSolverrURL())
	if endpoint == "" {
		return nil, nil, fmt.Errorf("flaresolverr url not configured")
	}

	htmlText, err := requestPageViaFlareSolverr(ctx, httpClient, endpoint, userAgent, imginnBaseURL+"/"+url.PathEscape(strings.TrimSpace(username))+"/")
	if err != nil {
		return nil, nil, err
	}

	stories, profile, err := parseImginnUserPageHTML(htmlText, username)
	if err != nil {
		return nil, nil, err
	}
	if profile == nil || strings.TrimSpace(profile.Username) == "" {
		return nil, nil, fmt.Errorf("imginn profile not found")
	}
	if len(stories) == 0 {
		return nil, nil, fmt.Errorf("imginn posts not found")
	}
	return stories, profile, nil
}

func getFlareSolverrURL() string {
	return strings.TrimSpace(strings.TrimRight(strings.TrimSpace(os.Getenv(flareSolverrEnvURL)), "/"))
}

func requestPageViaFlareSolverr(ctx context.Context, httpClient *http.Client, endpoint, userAgent, pageURL string) (string, error) {
	reqBody := flareSolverrRequest{
		Cmd:        "request.get",
		URL:        strings.TrimSpace(pageURL),
		MaxTimeout: int((flareSolverrRequestTimeout + 5*time.Second).Milliseconds()),
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/v1", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(userAgent) != "" {
		req.Header.Set("User-Agent", strings.TrimSpace(userAgent))
	}

	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: flareSolverrRequestTimeout}
	} else {
		clone := *client
		if clone.Timeout == 0 || clone.Timeout < flareSolverrRequestTimeout {
			clone.Timeout = flareSolverrRequestTimeout
		}
		client = &clone
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	_ = resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("flaresolverr status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed flareSolverrResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("flaresolverr decode failed: %w", err)
	}
	if !strings.EqualFold(strings.TrimSpace(parsed.Status), "ok") {
		return "", fmt.Errorf("flaresolverr failed: %s", strings.TrimSpace(parsed.Message))
	}
	if parsed.Solution.Status < 200 || parsed.Solution.Status >= 300 {
		return "", fmt.Errorf("flaresolverr solution status=%d", parsed.Solution.Status)
	}
	if strings.TrimSpace(parsed.Solution.Response) == "" {
		return "", fmt.Errorf("flaresolverr empty response")
	}
	return parsed.Solution.Response, nil
}

func parseImginnUserPageHTML(htmlText, username string) ([]StoryItem, *UserProfile, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlText))
	if err != nil {
		return nil, nil, err
	}

	profile := parseImginnProfile(doc, username)
	stories := parseImginnPosts(doc, profile.Username)
	return stories, profile, nil
}

func parseImginnProfile(doc *goquery.Document, fallbackUsername string) *UserProfile {
	userInfo := doc.Find("div.userinfo").First()
	profile := &UserProfile{
		Username: strings.TrimSpace(fallbackUsername),
	}
	if userInfo.Length() == 0 {
		return profile
	}

	if v, ok := userInfo.Attr("data-id"); ok {
		profile.ID = strings.TrimSpace(v)
	}
	if v, ok := userInfo.Attr("data-name"); ok && strings.TrimSpace(v) != "" {
		profile.Username = strings.TrimSpace(v)
	}
	if v, ok := userInfo.Attr("data-verified"); ok {
		profile.IsVerified = strings.EqualFold(strings.TrimSpace(v), "true") || strings.TrimSpace(v) == "1"
	}

	profile.FullName = strings.TrimSpace(userInfo.Find("h1").First().Text())
	profile.Biography = strings.TrimSpace(userInfo.Find("div.bio").First().Text())

	if avatar, ok := userInfo.Find("div.img img").First().Attr("src"); ok {
		profile.ProfilePicURL = html.UnescapeString(strings.TrimSpace(avatar))
		profile.ProfilePicURLHD = profile.ProfilePicURL
	}

	userInfo.Find("div.counter .counter-item").Each(func(_ int, s *goquery.Selection) {
		label := strings.ToLower(strings.TrimSpace(s.Find("span").First().Text()))
		value := parseImginnCount(s.Find("div.num").First().Text())
		switch label {
		case "followers":
			profile.EdgeFollowedBy = value
		case "following":
			profile.EdgeFollow = value
		case "posts":
			profile.EdgesCount = value
		}
	})

	return profile
}

func parseImginnPosts(doc *goquery.Document, username string) []StoryItem {
	items := make([]StoryItem, 0, 32)
	doc.Find("div.items > div.item").Each(func(_ int, item *goquery.Selection) {
		postHref, _ := item.Find("div.img a").First().Attr("href")
		postCode := extractImginnPostCode(postHref)
		if postCode == "" {
			return
		}

		download := item.Find("a.download").First()
		ariaLabel, _ := download.Attr("aria-label")
		caption := extractCaptionFromDownloadAriaLabel(ariaLabel)
		if caption == "" {
			alt, _ := item.Find("div.img img").First().Attr("alt")
			caption = extractCaptionFromImgAlt(alt, username)
		}

		likeCount := parseImginnCount(item.Find("div.stats .likes span").First().Text())
		commentCount := parseImginnCount(item.Find("div.stats .comments span").First().Text())

		thumb, _ := item.Find("div.img img").First().Attr("src")
		thumb = html.UnescapeString(strings.TrimSpace(thumb))

		dataSrcs, _ := download.Attr("data-srcs")
		mediaURLs := parseImginnMediaURLs(dataSrcs)
		if len(mediaURLs) == 0 {
			dl, _ := download.Attr("href")
			if u := html.UnescapeString(strings.TrimSpace(dl)); u != "" {
				mediaURLs = append(mediaURLs, u)
			}
		}
		if len(mediaURLs) == 0 && thumb != "" {
			mediaURLs = append(mediaURLs, thumb)
		}
		if len(mediaURLs) == 0 {
			return
		}

		for idx, mediaURL := range mediaURLs {
			isVideo := isLikelyVideoURL(mediaURL)
			videoURL := ""
			displayURL := mediaURL
			if isVideo {
				videoURL = mediaURL
			}
			story := StoryItem{
				ID:                 fmt.Sprintf("%s_%d", postCode, idx),
				DisplayURL:         displayURL,
				DisplayURLFilename: path.Base(path.Clean(urlPath(mediaURL))),
				IsVideo:            boolPtr(isVideo),
				ThumbnailSrc:       thumb,
				LikeCount:          likeCount,
				CommentCount:       commentCount,
				Title:              caption,
				Content:            caption,
				VideoURL:           videoURL,
			}
			if story.DisplayURLFilename == "." || story.DisplayURLFilename == "/" {
				story.DisplayURLFilename = filenameFromURL(mediaURL)
			}
			if strings.TrimSpace(story.DisplayURLFilename) == "" {
				story.DisplayURLFilename = filenameFromURL(mediaURL)
			}
			items = append(items, story)
		}
	})
	return items
}

func parseImginnMediaURLs(raw string) []string {
	parts := strings.Split(html.UnescapeString(strings.TrimSpace(raw)), ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

func extractImginnPostCode(href string) string {
	u, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(strings.TrimSpace(u.Path), "/"), "/")
	if len(parts) < 2 {
		return ""
	}
	switch parts[0] {
	case "p", "reel":
		return strings.TrimSpace(parts[1])
	default:
		return ""
	}
}

func extractCaptionFromDownloadAriaLabel(label string) string {
	s := strings.TrimSpace(html.UnescapeString(label))
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	const prefix = "download "
	if strings.HasPrefix(lower, prefix) {
		s = strings.TrimSpace(s[len(prefix):])
		lower = strings.ToLower(s)
	}
	for _, suffix := range []string{" images or videos", " image or video"} {
		if strings.HasSuffix(lower, suffix) {
			s = strings.TrimSpace(s[:len(s)-len(suffix)])
			break
		}
	}
	return strings.TrimSpace(s)
}

func extractCaptionFromImgAlt(alt, username string) string {
	s := strings.TrimSpace(html.UnescapeString(alt))
	if s == "" {
		return ""
	}
	needle := " by @" + strings.ToLower(strings.TrimSpace(username)) + " at "
	lower := strings.ToLower(s)
	if idx := strings.Index(lower, needle); idx > 0 {
		return strings.TrimSpace(s[:idx])
	}
	if idx := strings.Index(lower, " by @"); idx > 0 {
		return strings.TrimSpace(s[:idx])
	}
	return s
}

func parseImginnCount(raw string) int64 {
	s := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(raw), ",", ""))
	if s == "" {
		return 0
	}
	m := 1.0
	switch {
	case strings.HasSuffix(s, "K"):
		m = 1_000
		s = strings.TrimSuffix(s, "K")
	case strings.HasSuffix(s, "M"):
		m = 1_000_000
		s = strings.TrimSuffix(s, "M")
	case strings.HasSuffix(s, "B"):
		m = 1_000_000_000
		s = strings.TrimSuffix(s, "B")
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0
	}
	return int64(math.Round(v * m))
}

func isLikelyVideoURL(raw string) bool {
	u := strings.ToLower(strings.TrimSpace(raw))
	return strings.Contains(u, ".mp4") || strings.Contains(u, "/v/t16/") || strings.Contains(u, "/video/")
}

func urlPath(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return u.Path
}
