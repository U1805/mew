package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadJSONFile_NotExist_ReturnsZero(t *testing.T) {
	type V struct {
		A int `json:"a"`
	}
	got, err := LoadJSONFile[V](filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("LoadJSONFile error: %v", err)
	}
	if got.A != 0 {
		t.Fatalf("expected zero value, got %#v", got)
	}
}

func TestSaveJSONFile_And_LoadJSONFile_RoundTrip(t *testing.T) {
	type V struct {
		A int `json:"a"`
	}

	p := filepath.Join(t.TempDir(), "a", "b", "state.json")
	if err := SaveJSONFile(p, V{A: 1}); err != nil {
		t.Fatalf("SaveJSONFile error: %v", err)
	}

	got, err := LoadJSONFile[V](p)
	if err != nil {
		t.Fatalf("LoadJSONFile error: %v", err)
	}
	if got.A != 1 {
		t.Fatalf("unexpected value: %#v", got)
	}

	if err := SaveJSONFile(p, V{A: 2}); err != nil {
		t.Fatalf("SaveJSONFile overwrite error: %v", err)
	}
	got, err = LoadJSONFile[V](p)
	if err != nil {
		t.Fatalf("LoadJSONFile error: %v", err)
	}
	if got.A != 2 {
		t.Fatalf("unexpected value after overwrite: %#v", got)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("expected no tmp file, stat err=%v", err)
	}
}
