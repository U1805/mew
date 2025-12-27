package core

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsDotEnvDisabled(t *testing.T) {
	unsetEnv(t, "MEW_DOTENV")
	if IsDotEnvDisabled() {
		t.Fatalf("empty should not disable")
	}

	t.Setenv("MEW_DOTENV", "0")
	if !IsDotEnvDisabled() {
		t.Fatalf(`"0" should disable`)
	}

	t.Setenv("MEW_DOTENV", "false")
	if !IsDotEnvDisabled() {
		t.Fatalf(`"false" should disable`)
	}

	t.Setenv("MEW_DOTENV", "1")
	if IsDotEnvDisabled() {
		t.Fatalf(`"1" should not disable`)
	}
}

func TestLoadDotEnvFromCaller_LoadsFromCWDAndRespectsPrecedence(t *testing.T) {
	unsetEnv(t, "MEW_DOTENV")
	unsetEnv(t, "MEW_TEST_DOTENV")

	dir := t.TempDir()
	oldwd, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldwd) })

	if err := os.WriteFile(filepath.Join(dir, ".env.local"), []byte("MEW_TEST_DOTENV=local\n"), 0o644); err != nil {
		t.Fatalf("write .env.local: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("MEW_TEST_DOTENV=env\n"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	LoadDotEnvFromCaller("[test]", 0)
	if got := os.Getenv("MEW_TEST_DOTENV"); got != "local" {
		t.Fatalf("expected .env.local to win, got %q", got)
	}
}

func TestLoadDotEnvFromCaller_Disabled_NoLoad(t *testing.T) {
	t.Setenv("MEW_DOTENV", "0")
	unsetEnv(t, "MEW_TEST_DOTENV_2")

	dir := t.TempDir()
	oldwd, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldwd) })

	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("MEW_TEST_DOTENV_2=1\n"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	LoadDotEnvFromCaller("[test]", 0)
	if got := os.Getenv("MEW_TEST_DOTENV_2"); got != "" {
		t.Fatalf("expected disabled dotenv to not load, got %q", got)
	}
}
