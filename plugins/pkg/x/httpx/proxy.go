package httpx

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func ProxyFuncFromString(raw string) (func(*http.Request) (*url.URL, error), error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	switch strings.ToLower(raw) {
	case "0", "false", "off", "no", "none", "direct":
		return nil, nil
	case "env":
		return http.ProxyFromEnvironment, nil
	default:
		u, err := ParseProxyURL(raw)
		if err != nil {
			return nil, err
		}
		return http.ProxyURL(u), nil
	}
}

func ParseProxyURL(raw string) (*url.URL, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, fmt.Errorf("empty proxy url")
	}
	if !strings.Contains(s, "://") {
		s = "http://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("unsupported scheme %q (only http/https)", u.Scheme)
	}
	if strings.TrimSpace(u.Host) == "" {
		return nil, fmt.Errorf("missing host")
	}
	return u, nil
}
