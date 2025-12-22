package state

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// BaseDir returns the base directory used for persistent plugin state.
//
// Override:
// - MEW_STATE_DIR: absolute or relative path
//
// Default:
// - os.UserCacheDir()/mew (preferred)
// - os.TempDir()/mew (fallback)
func BaseDir() string {
	if raw := strings.TrimSpace(os.Getenv("MEW_STATE_DIR")); raw != "" {
		return raw
	}
	if d, err := os.UserCacheDir(); err == nil && strings.TrimSpace(d) != "" {
		return filepath.Join(d, "mew")
	}
	return filepath.Join(os.TempDir(), "mew")
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
