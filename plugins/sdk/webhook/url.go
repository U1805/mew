package webhook

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// RewriteLoopbackURL rewrites rawURL's scheme/host to match apiBase's origin
// if rawURL points to a loopback address (localhost / 127.0.0.1 / ::1).
//
// This is useful in Docker where "localhost" inside a container refers to the
// container itself, not the MEW server service.
func RewriteLoopbackURL(rawURL, apiBase string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", fmt.Errorf("empty url")
	}
	apiBase = strings.TrimSpace(apiBase)
	if apiBase == "" {
		return "", fmt.Errorf("empty apiBase")
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid url (missing scheme/host): %q", rawURL)
	}

	base, err := url.Parse(strings.TrimRight(apiBase, "/"))
	if err != nil {
		return "", err
	}
	if base.Scheme == "" || base.Host == "" {
		return "", fmt.Errorf("invalid apiBase (missing scheme/host): %q", apiBase)
	}

	if !isLoopbackHost(u.Hostname()) {
		return rawURL, nil
	}

	u.Scheme = base.Scheme
	u.Host = base.Host
	return u.String(), nil
}

func isLoopbackHost(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback()
}
