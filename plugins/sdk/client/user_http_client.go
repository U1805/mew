package client

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"mew/plugins/sdk/util/httpclient"
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
		proxyFunc, err := httpclient.ProxyFuncFromString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
		}
		transport.Proxy = proxyFunc
	}

	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
	}, nil
}
