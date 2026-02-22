package client

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"time"
)

// NewUserHTTPClient creates an HTTP client for MEW server endpoints called with
// user/bot JWTs.
//
// Proxy behavior:
// - Always direct connection for MEW server APIs.
func NewUserHTTPClient() (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil

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
