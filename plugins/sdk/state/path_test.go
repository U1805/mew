package state

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTaskFile_IgnoresLegacyLayout(t *testing.T) {
	base := t.TempDir()
	t.Setenv("MEW_STATE_DIR", base)

	serviceType := "svc-" + strings.ReplaceAll(t.Name(), "/", "_")
	botID := "bot-" + strings.ReplaceAll(t.Name(), "/", "_")
	idx := 1
	identity := "identity-" + t.Name()

	sum := sha256.Sum256([]byte(identity))
	shortHash := hex.EncodeToString(sum[:])[:12]
	filename := fmt.Sprintf("task-%d-%s.json", idx, shortHash)

	legacyPath := filepath.Join(os.TempDir(), "mew", serviceType, botID, filename)
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatalf("mkdir legacy dir: %v", err)
	}
	if err := os.WriteFile(legacyPath, []byte("{}"), 0o644); err != nil {
		t.Fatalf("write legacy file: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(os.TempDir(), "mew", serviceType)) })

	got := TaskFile(serviceType, botID, idx, identity)
	want := filepath.Join(base, "plugins", serviceType, botID, filename)

	if got != want {
		t.Fatalf("TaskFile() = %q, want %q", got, want)
	}
	if got == legacyPath {
		t.Fatalf("TaskFile() returned legacy path: %q", got)
	}
}

