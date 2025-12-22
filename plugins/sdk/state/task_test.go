package state

import (
	"path/filepath"
	"testing"
)

func TestBaseDir_EnvOverride(t *testing.T) {
	base := t.TempDir()
	t.Setenv("MEW_STATE_DIR", base)
	if got := BaseDir(); got != base {
		t.Fatalf("BaseDir() = %q, want %q", got, base)
	}

	got := TaskFile("svc", "bot", 1, "id")
	wantDir := filepath.Join(base, "plugins", "svc", "bot")
	if filepath.Dir(got) != wantDir {
		t.Fatalf("TaskFile() dir = %q, want %q", filepath.Dir(got), wantDir)
	}
}

