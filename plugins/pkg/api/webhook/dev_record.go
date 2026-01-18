package webhook

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"mew/plugins/pkg/x/devmode"
)

type recordedRequest struct {
	ID        string            `json:"id"`
	Time      string            `json:"time"`
	Kind      string            `json:"kind"` // "webhook.post" | "webhook.upload"
	Method    string            `json:"method"`
	URL       string            `json:"url,omitempty"`
	APIBase   string            `json:"apiBase,omitempty"`
	Webhook   string            `json:"webhookURL,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Body      json.RawMessage   `json:"body,omitempty"`
	UploadKey string            `json:"uploadKey,omitempty"`
	Filename  string            `json:"filename,omitempty"`
	Type      string            `json:"contentType,omitempty"`
	Size      int64             `json:"size,omitempty"`
}

func recordWebhookJSON(apiBase, webhookURL, target string, body []byte) error {
	id := devmode.TimestampID()
	st := devmode.ServiceTypeFromCaller()
	p := filepath.Join(devmode.Dir(), "webhook", "post", st+"-"+id+".json")
	return saveJSONIndentedFile(p, recordedRequest{
		ID:      id,
		Time:    time.Now().UTC().Format(time.RFC3339Nano),
		Kind:    "webhook.post",
		Method:  "POST",
		URL:     target,
		APIBase: apiBase,
		Webhook: webhookURL,
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
		Body: json.RawMessage(body),
	})
}

type recordedUpload struct {
	ID          string `json:"id"`
	Time        string `json:"time"`
	Kind        string `json:"kind"`
	APIBase     string `json:"apiBase,omitempty"`
	Webhook     string `json:"webhookURL,omitempty"`
	Target      string `json:"target,omitempty"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	Key         string `json:"key"`
	FilePath    string `json:"filePath"`
}

func recordUpload(apiBase, webhookURL, target, filename, contentType string, dataPath string, size int64, key string) error {
	id := devmode.TimestampID()
	st := devmode.ServiceTypeFromCaller()
	p := filepath.Join(devmode.Dir(), "webhook", "upload", st+"-"+id+".json")
	return saveJSONIndentedFile(p, recordedUpload{
		ID:          id,
		Time:        time.Now().UTC().Format(time.RFC3339Nano),
		Kind:        "webhook.upload",
		APIBase:     apiBase,
		Webhook:     webhookURL,
		Target:      target,
		Filename:    filename,
		ContentType: contentType,
		Size:        size,
		Key:         key,
		FilePath:    dataPath,
	})
}

func saveReaderAtomic(path string, src io.Reader, perm os.FileMode) (int64, error) {
	if src == nil {
		return 0, fmt.Errorf("nil reader")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}

	dir := filepath.Dir(path)
	base := filepath.Base(path)
	tmp, err := os.CreateTemp(dir, base+".tmp-*")
	if err != nil {
		return 0, err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()

	n, copyErr := io.Copy(tmp, src)
	closeErr := tmp.Close()
	if copyErr != nil {
		return n, copyErr
	}
	if closeErr != nil {
		return n, closeErr
	}

	if err := os.Chmod(tmp.Name(), perm); err != nil {
		return n, err
	}

	_ = os.Remove(path) // Windows rename doesn't overwrite.
	if err := os.Rename(tmp.Name(), path); err != nil {
		return n, err
	}
	return n, nil
}

func saveJSONIndentedFile(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	b, err := json.MarshalIndent(v, "", "  ")
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
