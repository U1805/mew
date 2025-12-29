package config

import (
	"encoding/json"
	"fmt"
	"strings"
)

type AssistantConfig struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Model   string `json:"model"`
}

func ParseAssistantConfig(raw string) (AssistantConfig, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "{}" {
		return AssistantConfig{}, nil
	}
	var cfg AssistantConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return AssistantConfig{}, fmt.Errorf("invalid config JSON: %w", err)
	}
	return cfg, nil
}
