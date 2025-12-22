package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type twitterTaskRaw struct {
	Interval           int    `json:"interval"`
	Webhook            string `json:"webhook"`
	Username           string `json:"username"`
	Handle             string `json:"handle"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
}

type twitterConfigWrapper struct {
	Tasks []twitterTaskRaw `json:"tasks"`
}

type TwitterTaskConfig struct {
	Interval           int
	Webhook            string
	Username           string
	Enabled            *bool
	SendHistoryOnStart *bool
}

func parseTwitterTasks(rawConfig string) ([]TwitterTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	var rawAny any
	if err := json.Unmarshal([]byte(rawConfig), &rawAny); err != nil {
		return nil, fmt.Errorf("config must be valid JSON: %w", err)
	}

	var rawTasks []twitterTaskRaw
	switch rawAny.(type) {
	case []any:
		if err := json.Unmarshal([]byte(rawConfig), &rawTasks); err != nil {
			return nil, fmt.Errorf("config array decode failed: %w", err)
		}
	case map[string]any:
		var wrapper twitterConfigWrapper
		if err := json.Unmarshal([]byte(rawConfig), &wrapper); err != nil {
			return nil, fmt.Errorf("config object decode failed: %w", err)
		}
		if len(wrapper.Tasks) > 0 {
			rawTasks = wrapper.Tasks
		} else {
			var single twitterTaskRaw
			if err := json.Unmarshal([]byte(rawConfig), &single); err != nil {
				return nil, fmt.Errorf("config single task decode failed: %w", err)
			}
			rawTasks = []twitterTaskRaw{single}
		}
	default:
		return nil, fmt.Errorf("config must be a JSON array or object")
	}

	validated := make([]TwitterTaskConfig, 0, len(rawTasks))
	for i, t := range rawTasks {
		interval := t.Interval
		if interval <= 0 {
			interval = 60 * 60 // 默认 60 分钟
		}

		webhook := strings.TrimSpace(t.Webhook)
		if webhook == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		webhookURL, err := url.Parse(webhook)
		if err != nil || webhookURL.Scheme == "" || webhookURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].webhook must be a valid URL", i)
		}
		if webhookURL.Scheme != "http" && webhookURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].webhook must be http/https", i)
		}

		username := strings.TrimSpace(t.Username)
		if username == "" {
			username = strings.TrimSpace(t.Handle)
		}
		username = strings.TrimPrefix(username, "@")
		if username == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}

		validated = append(validated, TwitterTaskConfig{
			Interval:           interval,
			Webhook:            webhook,
			Username:           username,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
		})
	}

	return validated, nil
}
