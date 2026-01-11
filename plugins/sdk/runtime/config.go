package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
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
// Example: plugins/fetchers/test/main.go -> "test".
func ServiceTypeFromCaller() string {
	return ServiceTypeFromCallerSkip(1)
}

// ServiceTypeFromCallerSkip is the same as ServiceTypeFromCaller, but allows
// specifying how many stack frames to skip when locating the caller file.
func ServiceTypeFromCallerSkip(callerSkip int) string {
	if _, file, _, ok := goruntime.Caller(callerSkip); ok {
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
	if serviceType == "sdk" {
		return RuntimeConfig{}, fmt.Errorf("invalid serviceType %q: reserved for internal use", serviceType)
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
