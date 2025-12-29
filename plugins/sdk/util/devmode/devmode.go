package devmode

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"mew/plugins/sdk/store"
)

func Enabled() bool {
	raw := strings.TrimSpace(os.Getenv("DEV_MODE"))
	if raw == "" {
		return false
	}
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

// Dir returns the base directory for dev-mode artifacts.
//
// Override:
// - MEW_DEV_DIR: absolute or relative path
//
// Default:
// - state.BaseDir()/dev
func Dir() string {
	if raw := strings.TrimSpace(os.Getenv("MEW_DEV_DIR")); raw != "" {
		return raw
	}
	return filepath.Join(store.BaseDir(), "dev")
}

func TimestampID() string {
	now := time.Now().UTC().Format("20060102T150405.000Z")
	var b [8]byte
	_, _ = rand.Read(b[:])
	return now + "-" + hex.EncodeToString(b[:])
}

func SanitizeFilename(name string) string {
	s := strings.TrimSpace(name)
	if s == "" {
		return "file"
	}
	s = strings.ReplaceAll(s, "\\", "_")
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, ":", "_")
	return s
}

// ServiceTypeFromCaller attempts to infer the plugin's serviceType from the
// first stack frame outside the plugins/sdk tree. If it can't be derived, it
// returns "unknown".
func ServiceTypeFromCaller() string {
	const maxSkip = 25
	for skip := 2; skip <= maxSkip; skip++ {
		_, file, _, ok := runtime.Caller(skip)
		if !ok {
			break
		}
		normalized := strings.ReplaceAll(file, "\\", "/")
		if strings.Contains(normalized, "/plugins/sdk/") {
			continue
		}
		base := filepath.Base(filepath.Dir(file))
		if strings.TrimSpace(base) == "" {
			break
		}
		return SanitizeFilename(base)
	}
	return "unknown"
}
