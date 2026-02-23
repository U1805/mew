package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const (
	defaultProxyBaseURL = "http://claude-code:3457"
	defaultTimeoutSec   = 180
)

type ClaudeCodeConfig struct {
	ProxyBaseURL  string `json:"proxy_base_url"`
	TimeoutSecond int    `json:"timeout_seconds"`
}

func ParseClaudeCodeConfig(raw string) (ClaudeCodeConfig, error) {
	cfg := ClaudeCodeConfig{
		ProxyBaseURL:  proxyBaseURLFromEnv(),
		TimeoutSecond: defaultTimeoutSec,
	}

	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "{}" {
		return cfg, nil
	}

	dec := json.NewDecoder(bytes.NewReader([]byte(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return ClaudeCodeConfig{}, fmt.Errorf("invalid config JSON: %w", err)
	}
	if dec.More() {
		return ClaudeCodeConfig{}, fmt.Errorf("invalid config JSON: trailing data")
	}

	cfg.ProxyBaseURL = strings.TrimSpace(cfg.ProxyBaseURL)
	if cfg.ProxyBaseURL == "" {
		cfg.ProxyBaseURL = proxyBaseURLFromEnv()
	}
	if cfg.TimeoutSecond <= 0 {
		cfg.TimeoutSecond = defaultTimeoutSec
	}
	return cfg, nil
}

func proxyBaseURLFromEnv() string {
	v := strings.TrimSpace(os.Getenv("CLAUDECODE_URL"))
	if v == "" {
		return defaultProxyBaseURL
	}
	return v
}
