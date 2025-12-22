package main

import (
	"fmt"
	"strings"

	"mew/plugins/sdk"
)

type PHTaskConfig struct {
	Username           string `json:"username"` // 对应 model username
	Webhook            string `json:"webhook"`
	Interval           int    `json:"interval"` // 轮询间隔(秒)
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"` // 启动时是否推送历史数据
}

func parsePHTasks(rawConfig string) ([]PHTaskConfig, error) {
	tasks, err := sdk.DecodeTasks[PHTaskConfig](rawConfig)
	if err != nil {
		return nil, err
	}

	validated := make([]PHTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if strings.TrimSpace(t.Username) == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}

		if t.Interval <= 0 {
			t.Interval = 12 * 60 * 60 // 默认 12 小时
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
