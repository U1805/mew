package main

import (
	"crypto/sha256"
	"encoding/hex"
	"html"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

func anyToString(v any) string {
	s, _ := v.(string)
	return s
}

var htmlTagRe = regexp.MustCompile(`(?is)<[^>]*>`)

func cleanText(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = htmlTagRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	s = strings.Join(strings.Fields(s), " ")
	return s
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return strings.TrimSpace(string(r[:max])) + "…"
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

var imgSrcRe = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))`)
var imgDataSrcRe = regexp.MustCompile(`(?is)<img[^>]+(?:data-src|data-original|data-lazy-src)\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))`)

func firstImageFromHTML(htmlStr string, baseURL string) string {
	if strings.TrimSpace(htmlStr) == "" {
		return ""
	}

	if m := imgDataSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := normalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
			return u
		}
	}

	if m := imgSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := normalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
			return u
		}
	}

	return ""
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func normalizeMaybeURL(raw string, baseURL string) string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}

	if strings.Contains(raw, ",") {
		raw = strings.TrimSpace(strings.Split(raw, ",")[0])
	}
	raw = strings.TrimSpace(strings.Split(raw, " ")[0])

	raw = strings.Trim(raw, `\"'`)
	raw = strings.TrimSpace(raw)

	if raw == "" || strings.HasPrefix(strings.ToLower(raw), "data:") {
		return ""
	}

	if strings.HasPrefix(raw, "//") {
		scheme := "https:"
		if u, err := url.Parse(baseURL); err == nil && u.Scheme != "" {
			scheme = u.Scheme + ":"
		}
		return scheme + raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Scheme == "http" || u.Scheme == "https" {
		return u.String()
	}

	base, err := url.Parse(baseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return ""
	}

	return base.ResolveReference(u).String()
}

func formatItemCard(feedTitle string, it *gofeed.Item, feedSiteURL string, feedURL string) (string, map[string]any) {
	if it == nil {
		return "", nil
	}
	title := cleanText(it.Title)
	if title == "" {
		title = "RSS 更新"
	}

	summary := cleanText(it.Description)
	if summary == "" {
		summary = cleanText(it.Content)
	}
	if summary == title {
		summary = ""
	}
	summary = truncateRunes(summary, 240)

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
		thumb = firstImageFromHTML(it.Content, base)
		if thumb == "" {
			thumb = firstImageFromHTML(it.Description, base)
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

	content := title
	return content, payload
}

func itemTime(it *gofeed.Item) time.Time {
	if it.PublishedParsed != nil {
		return *it.PublishedParsed
	}
	if it.UpdatedParsed != nil {
		return *it.UpdatedParsed
	}
	return time.Time{}
}

func itemIdentity(it *gofeed.Item) string {
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
