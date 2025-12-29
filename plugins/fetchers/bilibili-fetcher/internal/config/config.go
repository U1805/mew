package config

import (
	"fmt"
	"strings"

	"mew/plugins/sdk"
)

type TaskConfig struct {
	UID                string `json:"uid"`
	Webhook            string `json:"webhook"`
	Interval           int    `json:"interval"` // 轮询间隔(秒)
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"` // 启动时是否推送历史数据
}

func ParseTasks(rawConfig string) ([]TaskConfig, error) {
	tasks, err := sdk.DecodeTasks[TaskConfig](rawConfig)
	if err != nil {
		return nil, err
	}

	validated := make([]TaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if strings.TrimSpace(t.UID) == "" {
			return nil, fmt.Errorf("tasks[%d].uid is required", i)
		}

		if t.Interval <= 0 {
			t.Interval = 5 * 60 // 默认 5 分钟
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
