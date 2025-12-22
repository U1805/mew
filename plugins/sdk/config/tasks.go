package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// DecodeTasks parses Bot.config (a JSON string) into a slice of T.
//
// Supported shapes:
// - `[]T`
// - `T` (single object)
// - `{ "tasks": []T }`
//
// Empty configs ("", "null", "{}") return (nil, nil).
func DecodeTasks[T any](rawConfig string) ([]T, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	first := firstNonSpace(rawConfig)
	switch first {
	case '[':
		var out []T
		if err := json.Unmarshal([]byte(rawConfig), &out); err != nil {
			return nil, fmt.Errorf("config array decode failed: %w", err)
		}
		return out, nil
	case '{':
		var obj map[string]json.RawMessage
		if err := json.Unmarshal([]byte(rawConfig), &obj); err != nil {
			return nil, fmt.Errorf("config object decode failed: %w", err)
		}
		if rawTasks, ok := obj["tasks"]; ok {
			var out []T
			if err := json.Unmarshal(rawTasks, &out); err != nil {
				return nil, fmt.Errorf("config.tasks decode failed: %w", err)
			}
			return out, nil
		}

		var single T
		if err := json.Unmarshal([]byte(rawConfig), &single); err != nil {
			return nil, fmt.Errorf("config single object decode failed: %w", err)
		}
		return []T{single}, nil
	default:
		return nil, fmt.Errorf("config must be a JSON array or object")
	}
}

func firstNonSpace(s string) byte {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	return bytes.TrimSpace([]byte(s))[0]
}
