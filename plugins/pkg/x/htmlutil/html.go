package htmlutil

import (
	stdhtml "html"
	"net/url"
	"regexp"
	"strings"
)

var htmlTagRe = regexp.MustCompile(`(?is)<[^>]*>`)

// CleanText normalizes a possibly-HTML string into a single-line plain text.
// It unescapes HTML entities, strips HTML tags, and collapses whitespace.
func CleanText(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}

	s = stdhtml.UnescapeString(s)
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = htmlTagRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	s = strings.Join(strings.Fields(s), " ")
	return s
}

var imgSrcRe = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))`)
var imgDataSrcRe = regexp.MustCompile(`(?is)<img[^>]+(?:data-src|data-original|data-lazy-src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))`)

// FirstImageURLFromHTML returns the first image URL found in the HTML string.
// It checks common lazy-load attributes first (data-src/data-original/data-lazy-src),
// then falls back to src. Relative URLs are resolved against baseURL.
func FirstImageURLFromHTML(htmlStr string, baseURL string) string {
	if strings.TrimSpace(htmlStr) == "" {
		return ""
	}

	if m := imgDataSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := NormalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
			return u
		}
	}
	if m := imgSrcRe.FindStringSubmatch(htmlStr); len(m) > 0 {
		if u := NormalizeMaybeURL(firstNonEmpty(m[1], m[2], m[3]), baseURL); u != "" {
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

// NormalizeMaybeURL trims and normalizes a URL-like string and resolves it against baseURL when needed.
// It supports:
// - http/https absolute URLs
// - protocol-relative URLs (//example.com/img.png)
// - relative URLs when baseURL is a valid absolute URL
// It filters out data: URLs.
func NormalizeMaybeURL(raw string, baseURL string) string {
	raw = stdhtml.UnescapeString(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}

	// Handle srcset-like values: "a.png 1x, b.png 2x" => take the first URL candidate.
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
