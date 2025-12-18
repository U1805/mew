package sdk

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type RuntimeConfig struct {
	AdminSecret  string
	ServiceType  string
	APIBase      string
	SyncInterval time.Duration
}

// ServiceTypeFromCaller returns the base name of the caller's source directory.
// Example: plugins/test/main.go -> "test".
func ServiceTypeFromCaller() string {
	// 0: ServiceTypeFromCaller, 1: plugin main, so we want 1.
	if _, file, _, ok := runtime.Caller(1); ok {
		return filepath.Base(filepath.Dir(file))
	}
	return ""
}

func LoadRuntimeConfig(serviceType string) (RuntimeConfig, error) {
	adminSecret := strings.TrimSpace(os.Getenv("MEW_ADMIN_SECRET"))
	if adminSecret == "" {
		return RuntimeConfig{}, fmt.Errorf("MEW_ADMIN_SECRET is required")
	}

	serviceType = strings.TrimSpace(serviceType)
	if serviceType == "" {
		return RuntimeConfig{}, fmt.Errorf("serviceType is required (derived from plugin folder name)")
	}

	apiBase := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_API_BASE")), "/")
	if apiBase == "" {
		mewURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_URL")), "/")
		if mewURL == "" {
			mewURL = "http://localhost:3000"
		}
		apiBase = mewURL + "/api"
	}

	syncInterval := 60 * time.Second
	if v := strings.TrimSpace(os.Getenv("MEW_CONFIG_SYNC_INTERVAL_SECONDS")); v != "" {
		secs, err := strconv.Atoi(v)
		if err != nil || secs <= 0 {
			return RuntimeConfig{}, fmt.Errorf("invalid MEW_CONFIG_SYNC_INTERVAL_SECONDS: %q", v)
		}
		syncInterval = time.Duration(secs) * time.Second
	}

	return RuntimeConfig{
		AdminSecret:  adminSecret,
		ServiceType:  serviceType,
		APIBase:      apiBase,
		SyncInterval: syncInterval,
	}, nil
}
