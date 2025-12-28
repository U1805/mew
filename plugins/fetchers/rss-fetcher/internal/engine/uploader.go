package engine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
	"mew/plugins/sdk"
)

type Uploader struct {
	apiBase    string
	webhookURL string
	httpClient *http.Client
}

func NewUploader(apiBase, webhookURL string, httpClient *http.Client) *Uploader {
	return &Uploader{apiBase: apiBase, webhookURL: webhookURL, httpClient: httpClient}
}

func (u *Uploader) Post(ctx context.Context, msg sdk.WebhookPayload) error {
	return sdk.PostWebhook(ctx, u.httpClient, u.apiBase, u.webhookURL, msg, 3)
}

func (u *Uploader) BuildItemWebhook(feedTitle, feedImageURL, feedSiteURL, feedURL string, it *gofeed.Item) (sdk.WebhookPayload, bool) {
	content, payload := FormatItemCard(feedTitle, it, feedSiteURL, feedURL)
	if payload == nil || strings.TrimSpace(anyToString(payload["url"])) == "" {
		return sdk.WebhookPayload{}, false
	}
	return sdk.WebhookPayload{
		Content:   content,
		Type:      "app/x-rss-card",
		Payload:   payload,
		Username:  strings.TrimSpace(feedTitle),
		AvatarURL: strings.TrimSpace(feedImageURL),
	}, true
}

func anyToString(v any) string {
	s, _ := v.(string)
	return s
}

func itemLink(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if s := strings.TrimSpace(it.Link); s != "" {
		return s
	}
	guid := strings.TrimSpace(it.GUID)
	if strings.HasPrefix(guid, "http://") || strings.HasPrefix(guid, "https://") {
		return guid
	}
	return ""
}

func itemPublished(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if it.PublishedParsed != nil {
		return it.PublishedParsed.UTC().Format(time.RFC3339)
	}
	if it.UpdatedParsed != nil {
		return it.UpdatedParsed.UTC().Format(time.RFC3339)
	}
	return strings.TrimSpace(it.Published)
}

func itemThumbnail(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if it.Image != nil {
		if s := strings.TrimSpace(it.Image.URL); s != "" {
			return s
		}
	}
	for _, enc := range it.Enclosures {
		if enc == nil {
			continue
		}
		if strings.HasPrefix(strings.TrimSpace(enc.Type), "image/") && strings.TrimSpace(enc.URL) != "" {
			return strings.TrimSpace(enc.URL)
		}
	}
	return ""
}

func FormatItemCard(feedTitle string, it *gofeed.Item, feedSiteURL string, feedURL string) (string, map[string]any) {
	if it == nil {
		return "", nil
	}
	title := sdk.CleanText(it.Title)
	if title == "" {
		title = "RSS 更新"
	}

	summary := sdk.CleanText(it.Description)
	if summary == "" {
		summary = sdk.CleanText(it.Content)
	}
	if summary == title {
		summary = ""
	}
	summary = sdk.PreviewString(summary, 240)

	link := itemLink(it)
	thumb := itemThumbnail(it)
	if thumb == "" {
		base := link
		if base == "" {
			base = strings.TrimSpace(feedSiteURL)
		}
		if base == "" {
			base = strings.TrimSpace(feedURL)
		}
		thumb = sdk.FirstImageURLFromHTML(it.Content, base)
		if thumb == "" {
			thumb = sdk.FirstImageURLFromHTML(it.Description, base)
		}
	}
	publishedAt := itemPublished(it)

	payload := map[string]any{
		"title":         title,
		"summary":       summary,
		"url":           link,
		"thumbnail_url": thumb,
		"feed_title":    strings.TrimSpace(feedTitle),
		"published_at":  publishedAt,
	}

	return title, payload
}

func ItemTime(it *gofeed.Item) time.Time {
	if it == nil {
		return time.Time{}
	}
	if it.PublishedParsed != nil {
		return *it.PublishedParsed
	}
	if it.UpdatedParsed != nil {
		return *it.UpdatedParsed
	}
	return time.Time{}
}

func ItemIdentity(it *gofeed.Item) string {
	if it == nil {
		return ""
	}
	if s := strings.TrimSpace(it.GUID); s != "" {
		return s
	}
	if s := strings.TrimSpace(it.Link); s != "" {
		return s
	}
	title := strings.TrimSpace(it.Title)
	pub := strings.TrimSpace(it.Published)
	if title == "" && pub == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(title + "\n" + pub))
	return hex.EncodeToString(sum[:])
}
