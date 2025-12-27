package core

import (
	"os"
	"strings"
)

func MewURLFromEnvOrAPIBase(apiBase, fallback string) string {
	mewURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_URL")), "/")
	if mewURL != "" {
		return mewURL
	}

	apiBase = strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if apiBase != "" {
		mewURL = strings.TrimSuffix(apiBase, "/api")
		mewURL = strings.TrimRight(mewURL, "/")
		if mewURL != "" {
			return mewURL
		}
	}

	fallback = strings.TrimRight(strings.TrimSpace(fallback), "/")
	if fallback == "" {
		fallback = "http://localhost:3000"
	}
	return fallback
}
