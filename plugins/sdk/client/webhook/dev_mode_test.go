package webhook

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func withEnv(t *testing.T, key, value string, fn func()) {
	t.Helper()
	prev, had := os.LookupEnv(key)
	if value == "" {
		_ = os.Unsetenv(key)
	} else {
		_ = os.Setenv(key, value)
	}
	t.Cleanup(func() {
		if had {
			_ = os.Setenv(key, prev)
		} else {
			_ = os.Unsetenv(key)
		}
	})
	fn()
}

func TestDevMode_PostJSON_RecordsFile(t *testing.T) {
	tmp := t.TempDir()
	withEnv(t, "MEW_DEV_DIR", tmp, func() {})
	withEnv(t, "DEV_MODE", "true", func() {})

	if err := PostJSON(context.Background(), nil, "https://example.com/api", "", []byte(`{"x":1}`)); err != nil {
		t.Fatalf("PostJSON: %v", err)
	}

	dir := filepath.Join(tmp, "webhook")
	entries, err := os.ReadDir(filepath.Join(dir, "post"))
	if err != nil {
		t.Fatalf("ReadDir(%s): %v", dir, err)
	}
	found := false
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, "post", e.Name()))
		if err != nil {
			t.Fatalf("ReadFile: %v", err)
		}
		var rec recordedRequest
		if err := json.Unmarshal(b, &rec); err != nil {
			t.Fatalf("Unmarshal: %v (body=%s)", err, string(b))
		}
		if rec.Kind == "webhook.post" {
			found = true
			var got map[string]any
			if err := json.Unmarshal(rec.Body, &got); err != nil {
				t.Fatalf("Unmarshal body: %v (body=%s)", err, string(rec.Body))
			}
			if got["x"] != float64(1) {
				t.Fatalf("unexpected body: %s", string(rec.Body))
			}
			break
		}
	}
	if !found {
		t.Fatalf("expected a recorded webhook.post file in %s", dir)
	}
}

func TestDevMode_UploadBytes_RecordsFile(t *testing.T) {
	tmp := t.TempDir()
	withEnv(t, "MEW_DEV_DIR", tmp, func() {})
	withEnv(t, "DEV_MODE", "1", func() {})

	att, err := UploadBytes(context.Background(), nil, "", "", "hello.txt", "text/plain", []byte("hello"))
	if err != nil {
		t.Fatalf("UploadBytes: %v", err)
	}
	if att.Size != 5 {
		t.Fatalf("unexpected size: %d", att.Size)
	}
	if att.Key == "" {
		t.Fatalf("expected non-empty key")
	}

	dir := filepath.Join(tmp, "webhook")
	entries, err := os.ReadDir(filepath.Join(dir, "upload"))
	if err != nil {
		t.Fatalf("ReadDir(%s): %v", dir, err)
	}

	var meta recordedUpload
	metaFound := false
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, "upload", e.Name()))
		if err != nil {
			t.Fatalf("ReadFile: %v", err)
		}
		var rec recordedUpload
		if err := json.Unmarshal(b, &rec); err != nil {
			t.Fatalf("Unmarshal: %v (body=%s)", err, string(b))
		}
		meta = rec
		metaFound = true
		break
	}
	if !metaFound {
		t.Fatalf("expected a recorded upload metadata file in %s", dir)
	}
	if meta.Key != att.Key {
		t.Fatalf("unexpected key in metadata: %q", meta.Key)
	}
	if meta.FilePath == "" {
		t.Fatalf("expected filePath in upload metadata")
	}
	if _, err := os.Stat(meta.FilePath); err != nil {
		t.Fatalf("Stat(%s): %v", meta.FilePath, err)
	}
}
