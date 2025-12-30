package config

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type AssistantConfig struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Model   string `json:"model"`
	// Timezone controls how timestamps are presented to the LLM (e.g. <mew_speaker time="HH:MM"/>).
	// Supported values:
	// - IANA TZ name, e.g. "Asia/Shanghai"
	// - Fixed offsets, e.g. "+08:00", "-07:00", "+0800", "UTC+8", "GMT+08:00"
	// Empty means default (UTC+8).
	Timezone string `json:"timezone"`
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

const DefaultTimezone = "+08:00"

func (c AssistantConfig) TimeLocation() (*time.Location, error) {
	return ResolveTimezoneLocation(c.Timezone)
}

func ResolveTimezoneLocation(tz string) (*time.Location, error) {
	tz = strings.TrimSpace(tz)
	if tz == "" {
		tz = DefaultTimezone
	}

	switch strings.ToUpper(tz) {
	case "BEIJING", "SHANGHAI", "ASIA/SHANGHAI", "CST":
		if loc, err := time.LoadLocation("Asia/Shanghai"); err == nil {
			return loc, nil
		}
		return time.FixedZone("UTC+08:00", 8*60*60), nil
	}

	if loc, ok, err := parseFixedOffsetTimezone(tz); err != nil {
		return nil, err
	} else if ok {
		return loc, nil
	}

	loc, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone %q (try \"+08:00\" or \"Asia/Shanghai\"): %w", tz, err)
	}
	return loc, nil
}

func parseFixedOffsetTimezone(raw string) (*time.Location, bool, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, false, nil
	}

	u := strings.ToUpper(s)
	if strings.HasPrefix(u, "UTC") {
		s = strings.TrimSpace(s[3:])
	} else if strings.HasPrefix(u, "GMT") {
		s = strings.TrimSpace(s[3:])
	}
	if s == "" {
		return time.UTC, true, nil
	}

	sign := 1
	switch s[0] {
	case '+':
		sign = 1
		s = s[1:]
	case '-':
		sign = -1
		s = s[1:]
	default:
		// Not an offset.
		return nil, false, nil
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
	}

	hours := 0
	mins := 0

	if strings.Contains(s, ":") {
		parts := strings.Split(s, ":")
		if len(parts) != 2 {
			return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
		}
		h, err := parseTwoDigits(parts[0])
		if err != nil {
			return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
		}
		m, err := parseTwoDigits(parts[1])
		if err != nil {
			return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
		}
		hours, mins = h, m
	} else {
		// Supported: H, HH, HHMM.
		switch len(s) {
		case 1, 2:
			h, err := parseInt(s)
			if err != nil {
				return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
			}
			hours = h
			mins = 0
		case 3, 4:
			// e.g. "800" or "0800" -> 8:00
			if len(s) == 3 {
				s = "0" + s
			}
			h, err := parseTwoDigits(s[:2])
			if err != nil {
				return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
			}
			m, err := parseTwoDigits(s[2:])
			if err != nil {
				return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
			}
			hours, mins = h, m
		default:
			return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
		}
	}

	if hours < 0 || hours > 14 || mins < 0 || mins > 59 {
		return nil, false, fmt.Errorf("invalid timezone offset %q", raw)
	}

	offset := sign * (hours*60*60 + mins*60)
	name := fmt.Sprintf("UTC%+03d:%02d", sign*hours, mins)
	return time.FixedZone(name, offset), true, nil
}

func parseTwoDigits(s string) (int, error) {
	if len(s) == 0 || len(s) > 2 {
		return 0, fmt.Errorf("invalid number")
	}
	return parseInt(s)
}

func parseInt(s string) (int, error) {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("invalid number")
		}
		n = n*10 + int(r-'0')
	}
	return n, nil
}
