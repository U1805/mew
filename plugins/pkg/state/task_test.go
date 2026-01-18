package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBaseDir_Default(t *testing.T) {
	d, err := os.UserCacheDir()
	if err != nil || d == "" {
		t.Skipf("os.UserCacheDir unavailable: %v", err)
	}

	base := filepath.Join(d, "mew")
	if got := BaseDir(); got != base {
		t.Fatalf("BaseDir() = %q, want %q", got, base)
	}

	got := TaskFile("svc", "bot", 1, "id")
	wantDir := filepath.Join(base, "plugins", "svc", "bot")
	if filepath.Dir(got) != wantDir {
		t.Fatalf("TaskFile() dir = %q, want %q", filepath.Dir(got), wantDir)
	}
}
