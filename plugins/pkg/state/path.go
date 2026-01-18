package state

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// BaseDir returns the base directory used for persistent plugin state.
//
// Default:
// - system user cache dir + "/mew"
func BaseDir() string {
	if d := strings.TrimSpace(userCacheDir()); d != "" {
		return filepath.Join(d, "mew")
	}
	// Prefer failing fast over writing state to an arbitrary/non-cache location.
	panic("state.BaseDir: cannot determine system user cache directory")
}

func BotDir(serviceType, botID string) string {
	return filepath.Join(BaseDir(), "plugins", serviceType, botID)
}

func TaskFile(serviceType, botID string, idx int, identity string) string {
	sum := sha256.Sum256([]byte(identity))
	shortHash := hex.EncodeToString(sum[:])[:12]
	filename := fmt.Sprintf("task-%d-%s.json", idx, shortHash)

	return filepath.Join(BotDir(serviceType, botID), filename)
}

func userCacheDir() string {
	if d, err := os.UserCacheDir(); err == nil && strings.TrimSpace(d) != "" {
		return d
	}

	switch runtime.GOOS {
	case "windows":
		if d := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); d != "" {
			return d
		}
		if d := strings.TrimSpace(os.Getenv("APPDATA")); d != "" {
			return d
		}
		if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
			return filepath.Join(home, "AppData", "Local")
		}
	case "darwin":
		if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
			return filepath.Join(home, "Library", "Caches")
		}
	default:
		if d := strings.TrimSpace(os.Getenv("XDG_CACHE_HOME")); d != "" {
			return d
		}
		if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
			return filepath.Join(home, ".cache")
		}
	}

	return ""
}
