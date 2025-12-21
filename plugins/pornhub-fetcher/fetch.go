package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"mew/plugins/sdk"
)

type PHVideoItem struct {
	ID           string
	Title        string
	URL          string
	ThumbnailURL string
	PreviewURL   string
}

type PHAuthorInfo struct {
	Name      string
	AvatarURL string
}

func fetchPHVideos(ctx context.Context, client *http.Client, username string) (PHAuthorInfo, []PHVideoItem, error) {
	targetURL := fmt.Sprintf("https://jp.pornhub.com/model/%s/videos", username)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return PHAuthorInfo{}, nil, err
	}
	// 必须设置 User-Agent，否则可能被拦截
	req.Header.Set("User-Agent", sdk.RandomBrowserUserAgent())
	req.Header.Set("Cookie", "bs=dfk32; accessAgeDisclaimerPH=1; age_verified=1; hasVisited=1")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	resp, err := client.Do(req)
	if err != nil {
		return PHAuthorInfo{}, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return PHAuthorInfo{}, nil, fmt.Errorf("http status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return PHAuthorInfo{}, nil, err
	}

	// 1. 解析作者信息
	authorInfo := PHAuthorInfo{Name: "Unknown", AvatarURL: ""}

	// name: div.name > h1
	if nameSel := doc.Find("div.name h1"); nameSel.Length() > 0 {
		authorInfo.Name = strings.TrimSpace(nameSel.Text())
	}
	// avatar: img#getAvatar
	if imgSel := doc.Find("img#getAvatar"); imgSel.Length() > 0 {
		if src, exists := imgSel.Attr("src"); exists {
			authorInfo.AvatarURL = src
		}
	}

	// 2. 解析视频列表
	// selector: li.pcVideoListItem:has(div.vidTitleWrapper)
	var videos []PHVideoItem

	doc.Find("li.pcVideoListItem").Each(func(i int, s *goquery.Selection) {
		// 过滤掉不包含 title wrapper 的项 (如广告)
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

		videoURL := "https://jp.pornhub.com" + href

		// ID: extract from viewkey=...
		videoID := ""
		if parts := strings.Split(videoURL, "viewkey="); len(parts) > 1 {
			videoID = parts[len(parts)-1]
		}
		if videoID == "" {
			return
		}

		// Thumbnail logic: data-mediumthumb -> src
		thumbURL, exists := thumbEl.Attr("data-mediumthumb")
		if !exists || thumbURL == "" {
			thumbURL, _ = thumbEl.Attr("src")
		}

		// Preview logic: data-mediabook
		previewURL, _ := thumbEl.Attr("data-mediabook")

		videos = append(videos, PHVideoItem{
			ID:           videoID,
			Title:        title,
			URL:          videoURL,
			ThumbnailURL: thumbURL,
			PreviewURL:   previewURL,
		})
	})

	// 这里的 videos 顺序通常是页面顺序（最新在前），但在 Runner 中我们会处理顺序
	return authorInfo, videos, nil
}