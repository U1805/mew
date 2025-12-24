package main

import (
	"fmt"
	"strings"

	"mew/plugins/sdk"
)

type instagramTaskRaw struct {
	Interval           int    `json:"interval"`
	Webhook            string `json:"webhook"`
	Username           string `json:"username"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
}

type InstagramTaskConfig struct {
	Interval           int
	Webhook            string
	Username           string
	Enabled            *bool
	SendHistoryOnStart *bool
}

func parseInstagramTasks(rawConfig string) ([]InstagramTaskConfig, error) {
	rawTasks, err := sdk.DecodeTasks[instagramTaskRaw](rawConfig)
	if err != nil {
		return nil, err
	}

	validated := make([]InstagramTaskConfig, 0, len(rawTasks))
	for i, t := range rawTasks {
		interval := t.Interval
		if interval <= 0 {
			interval = 60 * 60 // 默认 60 分钟
		}

		webhook := strings.TrimSpace(t.Webhook)
		if webhook == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		if err := sdk.ValidateHTTPURL(webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid: %w", i, err)
		}

		username := strings.TrimSpace(t.Username)
		username = strings.TrimPrefix(username, "@")
		if username == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}

		validated = append(validated, InstagramTaskConfig{
			Interval:           interval,
			Webhook:            webhook,
			Username:           username,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
		})
	}

	return validated, nil
}

