package source

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"mew/plugins/sdk"
)

const DefaultBaseURL = "https://jp.pornhub.com"

type Client struct {
	httpClient *http.Client
	baseURL    string
}

func NewClient(httpClient *http.Client, baseURL string) *Client {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{httpClient: httpClient, baseURL: baseURL}
}

func (c *Client) FetchModelVideosPage(ctx context.Context, username string) (io.ReadCloser, error) {
	targetURL := fmt.Sprintf("%s/model/%s/videos", c.baseURL, strings.TrimSpace(username))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", sdk.RandomBrowserUserAgent())
	req.Header.Set("Cookie", "bs=dfk32; accessAgeDisclaimerPH=1; age_verified=1; hasVisited=1")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("http status %d", resp.StatusCode)
	}
	return resp.Body, nil
}

func ParseModelVideos(r io.Reader, baseURL string) (Author, []Video, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}

	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return Author{}, nil, err
	}

	author := Author{Name: "Unknown", AvatarURL: ""}
	if nameSel := doc.Find("div.name h1"); nameSel.Length() > 0 {
		author.Name = strings.TrimSpace(nameSel.Text())
	}
	if imgSel := doc.Find("img#getAvatar"); imgSel.Length() > 0 {
		if src, exists := imgSel.Attr("src"); exists {
			author.AvatarURL = strings.TrimSpace(src)
		}
	}

	var videos []Video
	doc.Find("li.pcVideoListItem").Each(func(i int, s *goquery.Selection) {
		if s.Find("div.vidTitleWrapper").Length() == 0 {
			return
		}

		titleEl := s.Find("span.title a")
		thumbEl := s.Find("img")
		if titleEl.Length() == 0 || thumbEl.Length() == 0 {
			return
		}

		href, _ := titleEl.Attr("href")
		title := strings.TrimSpace(titleEl.Text())
		if strings.TrimSpace(href) == "" || title == "" {
			return
		}

		videoURL := baseURL + href

		videoID := ""
		if parts := strings.Split(videoURL, "viewkey="); len(parts) > 1 {
			videoID = parts[len(parts)-1]
		}
		videoID = strings.TrimSpace(videoID)
		if videoID == "" {
			return
		}

		thumbURL, exists := thumbEl.Attr("data-mediumthumb")
		if !exists || strings.TrimSpace(thumbURL) == "" {
			thumbURL, _ = thumbEl.Attr("src")
		}
		thumbURL = strings.TrimSpace(thumbURL)

		previewURL, _ := thumbEl.Attr("data-mediabook")
		previewURL = strings.TrimSpace(previewURL)

		videos = append(videos, Video{
			ID:           videoID,
			Title:        title,
			URL:          videoURL,
			ThumbnailURL: thumbURL,
			PreviewURL:   previewURL,
		})
	})

	return author, videos, nil
}
