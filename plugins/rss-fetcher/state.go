package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type taskState struct {
	ETag         string   `json:"etag,omitempty"`
	LastModified string   `json:"last_modified,omitempty"`
	FeedTitle    string   `json:"feed_title,omitempty"`
	FeedImageURL string   `json:"feed_image_url,omitempty"`
	FeedSiteURL  string   `json:"feed_site_url,omitempty"`
	Seen         []string `json:"seen,omitempty"`
}

func taskStateFile(botID string, idx int, rssURL string) string {
	sum := sha256.Sum256([]byte(rssURL))
	shortHash := hex.EncodeToString(sum[:])[:12]
	dir := filepath.Join(os.TempDir(), "mew", "rss-fetcher", botID)
	return filepath.Join(dir, fmt.Sprintf("task-%d-%s.json", idx, shortHash))
}

func loadTaskState(path string) (taskState, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return taskState{}, nil
		}
		return taskState{}, err
	}
	var st taskState
	if err := json.Unmarshal(b, &st); err != nil {
		return taskState{}, err
	}
	return st, nil
}

func saveTaskState(path string, st taskState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	b, err := json.Marshal(st)
	if err != nil {
		return err
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	_ = os.Remove(path) // Windows rename doesn't overwrite.
	return os.Rename(tmp, path)
}
