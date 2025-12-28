package config

import (
	"fmt"
	"strings"

	"mew/plugins/sdk"
)

type taskRaw struct {
	Interval           int    `json:"interval"`
	Webhook            string `json:"webhook"`
	Username           string `json:"username"`
	Handle             string `json:"handle"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
}

type TaskConfig struct {
	Interval           int
	Webhook            string
	Username           string
	Enabled            *bool
	SendHistoryOnStart *bool
}

func ParseTasks(rawConfig string) ([]TaskConfig, error) {
	rawTasks, err := sdk.DecodeTasks[taskRaw](rawConfig)
	if err != nil {
		return nil, err
	}

	validated := make([]TaskConfig, 0, len(rawTasks))
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
		if username == "" {
			username = strings.TrimSpace(t.Handle)
		}
		username = strings.TrimPrefix(username, "@")
		if username == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}

		validated = append(validated, TaskConfig{
			Interval:           interval,
			Webhook:            webhook,
			Username:           username,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
		})
	}

	return validated, nil
}
