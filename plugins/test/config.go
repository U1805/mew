package main

import (
	"fmt"
	"strings"

	"mew/plugins/sdk"
)

type TestTaskConfig struct {
	Interval int    `json:"interval"`
	Webhook  string `json:"webhook"`
	Content  string `json:"content"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

func parseTasks(rawConfig string) ([]TestTaskConfig, error) {
	tasks, err := sdk.DecodeTasks[TestTaskConfig](rawConfig)
	if err != nil {
		return nil, err
	}

	validated := make([]TestTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if t.Interval <= 0 {
			t.Interval = 30 // 默认 30 秒
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		if err := sdk.ValidateHTTPURL(t.Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid: %w", i, err)
		}
		validated = append(validated, t)
	}

	return validated, nil
}
