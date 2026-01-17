package config

import (
	"encoding/json"
	"fmt"
	"strings"
)

type JpdictConfig struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Model   string `json:"model"`
}

func ParseJpdictConfig(raw string) (JpdictConfig, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "{}" {
		return JpdictConfig{}, nil
	}
	var cfg JpdictConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return JpdictConfig{}, fmt.Errorf("invalid config JSON: %w", err)
	}
	return cfg, nil
}
