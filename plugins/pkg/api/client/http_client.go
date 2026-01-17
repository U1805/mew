package client

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"time"

	"mew/plugins/pkg/x/httpx"
)

// NewUserHTTPClient creates an HTTP client for MEW server endpoints called with
// user/bot JWTs.
//
// Proxy behavior:
// - Default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)
// - Set MEW_API_PROXY to enable:
//   - "env": use Go's ProxyFromEnvironment (HTTP_PROXY/HTTPS_PROXY/NO_PROXY)
//   - URL / host:port: use a fixed proxy URL (http/https)
func NewUserHTTPClient() (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil // default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)

	if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
		proxyFunc, err := httpx.ProxyFuncFromString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
		}
		transport.Proxy = proxyFunc
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("create cookie jar: %w", err)
	}

	return &http.Client{
		Transport: transport,
		Jar:       jar,
		Timeout:   15 * time.Second,
	}, nil
}
