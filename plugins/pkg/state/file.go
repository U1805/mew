package state

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func LoadJSONFile[T any](path string) (T, error) {
	var zero T
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return zero, nil
		}
		return zero, err
	}
	if err := json.Unmarshal(b, &zero); err != nil {
		return zero, err
	}
	return zero, nil
}

func SaveJSONFile(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	b, err := json.Marshal(v)
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

func SaveJSONFileIndented(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}

	_ = os.Remove(path) // Windows rename doesn't overwrite.
	return os.Rename(tmp, path)
}
