package source

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const urlebirdBaseURL = "https://urlebird.com"
const flareSolverrRequestTimeout = 130 * time.Second

var urlebirdVideoIDPattern = regexp.MustCompile(`(\d{10,})`)

type ldType struct {
	Type string `json:"@type"`
}

type ldInteraction struct {
	InteractionType struct {
		Type string `json:"@type"`
	} `json:"interactionType"`
	UserInteractionCount int64 `json:"userInteractionCount"`
}

type ldProfilePage struct {
	Type       string `json:"@type"`
	MainEntity struct {
		Name                 string          `json:"name"`
		AlternateName        string          `json:"alternateName"`
		Identifier           string          `json:"identifier"`
		URL                  string          `json:"url"`
		Image                string          `json:"image"`
		Description          string          `json:"description"`
		InteractionStatistic []ldInteraction `json:"interactionStatistic"`
	} `json:"mainEntity"`
}

type ldItemList struct {
	Type            string          `json:"@type"`
	ItemListElement []ldVideoObject `json:"itemListElement"`
}

type ldVideoObject struct {
	Position             int64           `json:"position"`
	URL                  string          `json:"url"`
	Name                 string          `json:"name"`
	Description          string          `json:"description"`
	UploadDate           string          `json:"uploadDate"`
	Duration             string          `json:"duration"`
	ThumbnailURL         []string        `json:"thumbnailUrl"`
	ContentURL           string          `json:"contentUrl"`
	Width                int64           `json:"width"`
	Height               int64           `json:"height"`
	InteractionStatistic []ldInteraction `json:"interactionStatistic"`
	Audio                *struct {
		Name   string `json:"name"`
		Author any    `json:"author"`
	} `json:"audio"`
	MainEntityOfPage *struct {
		ID string `json:"@id"`
	} `json:"mainEntityOfPage"`
}

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

func (c *Client) fetchUrlebirdDirect(ctx context.Context, client *http.Client, userAgent, username string) (Feed, error) {
	pageURL := fmt.Sprintf("%s/user/%s/", urlebirdBaseURL, url.PathEscape(strings.TrimSpace(username)))

	status, body, err := doRequest(ctx, client, http.MethodGet, pageURL, nil, map[string]string{
		"User-Agent":      userAgent,
		"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer":         urlebirdBaseURL + "/",
		"Cache-Control":   "no-cache",
		"Pragma":          "no-cache",
	})
	if err != nil {
		return Feed{}, err
	}
	if status < 200 || status >= 300 {
		return Feed{}, fmt.Errorf("urlebird http status=%d body=%s", status, strings.TrimSpace(string(body)))
	}

	return parseUrlebirdHTML(string(body), pageURL, username)
}

func (c *Client) fetchUrlebirdViaFlareSolverr(ctx context.Context, client *http.Client, userAgent, username string) (Feed, error) {
	endpoint := getFlareSolverrURL()
	if endpoint == "" {
		return Feed{}, fmt.Errorf("flaresolverr url not configured")
	}

	pageURL := fmt.Sprintf("%s/user/%s/", urlebirdBaseURL, url.PathEscape(strings.TrimSpace(username)))
	htmlText, err := requestPageViaFlareSolverr(ctx, client, endpoint, userAgent, pageURL)
	if err != nil {
		return Feed{}, err
	}
	return parseUrlebirdHTML(htmlText, pageURL, username)
}

func getFlareSolverrURL() string {
	return strings.TrimSpace(strings.TrimRight(strings.TrimSpace(os.Getenv(flareSolverrEnvURL)), "/"))
}

func requestPageViaFlareSolverr(ctx context.Context, client *http.Client, endpoint, userAgent, pageURL string) (string, error) {
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

	httpClient := client
	if httpClient == nil {
		httpClient = &http.Client{Timeout: flareSolverrRequestTimeout}
	} else {
		clone := *httpClient
		if clone.Timeout == 0 || clone.Timeout < flareSolverrRequestTimeout {
			clone.Timeout = flareSolverrRequestTimeout
		}
		httpClient = &clone
	}

	resp, err := httpClient.Do(req)
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

func parseUrlebirdHTML(htmlText, pageURL, username string) (Feed, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlText))
	if err != nil {
		return Feed{}, err
	}

	feed := Feed{
		Profile: Profile{
			Username:   strings.TrimSpace(strings.TrimPrefix(username, "@")),
			ProfileURL: strings.TrimSpace(pageURL),
		},
	}

	scripts := doc.Find(`script[type="application/ld+json"]`)
	if scripts.Length() == 0 {
		return Feed{}, fmt.Errorf("no json-ld script found")
	}

	var videos []Video
	scripts.Each(func(_ int, s *goquery.Selection) {
		raw := strings.TrimSpace(s.Text())
		if raw == "" {
			return
		}
		blocks := splitJSONLDBlocks(raw)
		for _, block := range blocks {
			var typ ldType
			if err := json.Unmarshal(block, &typ); err != nil {
				continue
			}
			switch strings.TrimSpace(typ.Type) {
			case "ProfilePage":
				var p ldProfilePage
				if err := json.Unmarshal(block, &p); err != nil {
					continue
				}
				feed.Profile.Name = strings.TrimSpace(p.MainEntity.Name)
				feed.Profile.Username = strings.TrimSpace(strings.TrimPrefix(firstNonEmpty(
					p.MainEntity.AlternateName,
					p.MainEntity.Identifier,
					feed.Profile.Username,
				), "@"))
				feed.Profile.Bio = strings.TrimSpace(p.MainEntity.Description)
				feed.Profile.ProfileURL = strings.TrimSpace(firstNonEmpty(p.MainEntity.URL, feed.Profile.ProfileURL))
				feed.Profile.AvatarURL = strings.TrimSpace(p.MainEntity.Image)
				feed.Profile.Hearts = findInteractionCount(p.MainEntity.InteractionStatistic, "LikeAction")
				feed.Profile.Followers = findInteractionCount(p.MainEntity.InteractionStatistic, "FollowAction")

			case "ItemList":
				var list ldItemList
				if err := json.Unmarshal(block, &list); err != nil {
					continue
				}
				for _, item := range list.ItemListElement {
					videoID := extractVideoID(item.URL)
					if videoID == "" && item.MainEntityOfPage != nil {
						videoID = extractVideoID(item.MainEntityOfPage.ID)
					}
					if videoID == "" {
						continue
					}

					v := Video{
						ID:           videoID,
						URL:          strings.TrimSpace(item.URL),
						Title:        strings.TrimSpace(item.Name),
						Description:  strings.TrimSpace(item.Description),
						UploadDate:   strings.TrimSpace(item.UploadDate),
						Duration:     strings.TrimSpace(item.Duration),
						ThumbnailURL: firstNonEmpty(item.ThumbnailURL...),
						ContentURL:   strings.TrimSpace(item.ContentURL),
						Width:        item.Width,
						Height:       item.Height,
						Views:        findInteractionCount(item.InteractionStatistic, "WatchAction"),
						Likes:        findInteractionCount(item.InteractionStatistic, "LikeAction"),
						Comments:     findInteractionCount(item.InteractionStatistic, "CommentAction"),
						Shares:       findInteractionCount(item.InteractionStatistic, "ShareAction"),
					}
					if item.Audio != nil {
						v.AudioName = strings.TrimSpace(item.Audio.Name)
						v.AudioAuthor = strings.TrimSpace(stringFromAny(item.Audio.Author))
					}
					videos = append(videos, v)
				}
			}
		}
	})

	if strings.TrimSpace(feed.Profile.Username) == "" {
		feed.Profile.Username = strings.TrimSpace(strings.TrimPrefix(username, "@"))
	}
	if strings.TrimSpace(feed.Profile.Name) == "" {
		feed.Profile.Name = feed.Profile.Username
	}

	if len(videos) == 0 {
		return Feed{}, fmt.Errorf("no videos found in json-ld")
	}
	feed.Videos = videos
	return feed, nil
}

func splitJSONLDBlocks(raw string) []json.RawMessage {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	blocks := make([]json.RawMessage, 0, 4)
	if strings.HasPrefix(raw, "[") {
		var arr []json.RawMessage
		if err := json.Unmarshal([]byte(raw), &arr); err == nil {
			return arr
		}
		return nil
	}

	var one json.RawMessage
	if err := json.Unmarshal([]byte(raw), &one); err == nil {
		blocks = append(blocks, one)
	}
	return blocks
}

func findInteractionCount(stats []ldInteraction, statTypeSuffix string) int64 {
	for _, s := range stats {
		t := strings.TrimSpace(s.InteractionType.Type)
		if strings.HasSuffix(t, statTypeSuffix) {
			return s.UserInteractionCount
		}
	}
	return 0
}

func extractVideoID(raw string) string {
	m := urlebirdVideoIDPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

func stringFromAny(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case map[string]any:
		if name, ok := x["name"].(string); ok {
			return strings.TrimSpace(name)
		}
		return ""
	default:
		return fmt.Sprintf("%v", x)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
