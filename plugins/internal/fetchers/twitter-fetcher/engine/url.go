package engine

import (
	"net/url"
	"strings"
)

// NormalizeMediaURL normalizes media URLs returned by upstream sources.
//
// twitterviewer.net sometimes returns URLs like:
//   - "/api/proxy/video.twimg.com/..."
//
// which are not directly downloadable/uploadable by the fetcher and will not work
// as-is in the client. This function rewrites them into absolute origin URLs:
//   - "https://video.twimg.com/..."
func NormalizeMediaURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}

	// Scheme-relative URL (e.g. //video.twimg.com/...)
	if strings.HasPrefix(s, "//") {
		return "https:" + s
	}

	// Absolute URL that still points to twitterviewer proxy.
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		if u, err := url.Parse(s); err == nil && u != nil && strings.HasPrefix(u.Path, "/api/proxy/") {
			// Preserve any query string.
			p := u.Path
			if strings.TrimSpace(u.RawQuery) != "" {
				p += "?" + u.RawQuery
			}
			return NormalizeMediaURL(p)
		}
		return s
	}

	// twitterviewer proxy path: /api/proxy/<host>/<path...>
	for _, prefix := range []string{"/api/proxy/", "api/proxy/"} {
		if !strings.HasPrefix(s, prefix) {
			continue
		}
		rem := strings.TrimPrefix(s, prefix)
		// host is the first path segment; the rest includes the leading slash.
		idx := strings.Index(rem, "/")
		if idx <= 0 {
			return s
		}
		host := strings.TrimSpace(rem[:idx])
		rest := rem[idx:] // keep leading slash
		if host == "" || strings.TrimSpace(rest) == "" {
			return s
		}
		return "https://" + host + rest
	}

	return s
}
