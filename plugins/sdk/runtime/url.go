package runtime

import (
	"fmt"
	"net/url"
	"strings"
)

func ValidateHTTPURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u == nil {
		return fmt.Errorf("invalid url")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("url must be http/https")
	}
	if strings.TrimSpace(u.Host) == "" {
		return fmt.Errorf("url missing host")
	}
	return nil
}
