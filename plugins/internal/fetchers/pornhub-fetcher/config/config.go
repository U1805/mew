package config

import (
	"fmt"
	"strings"

	"mew/plugins/pkg"
)

type TaskConfig struct {
	Username           string `json:"username"` // 对应 model username
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
	for i, task := range tasks {
		if strings.TrimSpace(task.Username) == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}

		if task.Interval <= 0 {
			task.Interval = 12 * 60 * 60 // 默认 12 小时
		}

		if strings.TrimSpace(task.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		if err := sdk.ValidateHTTPURL(task.Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid: %w", i, err)
		}

		validated = append(validated, task)
	}
	return validated, nil
}
