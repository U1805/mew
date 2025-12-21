package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type PHTaskConfig struct {
	Username           string `json:"username"`             // 对应 model username
	Webhook            string `json:"webhook"`
	Interval           int    `json:"interval"`             // 轮询间隔(秒)
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"` // 启动时是否推送历史数据
}

func parsePHTasks(rawConfig string) ([]PHTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	// 兼容数组或单对象配置
	var tasks []PHTaskConfig
	if err := json.Unmarshal([]byte(rawConfig), &tasks); err != nil {
		var single PHTaskConfig
		if err2 := json.Unmarshal([]byte(rawConfig), &single); err2 == nil {
			tasks = []PHTaskConfig{single}
		} else {
			return nil, fmt.Errorf("config must be JSON array or object: %w", err)
		}
	}

	validated := make([]PHTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if strings.TrimSpace(t.Username) == "" {
			return nil, fmt.Errorf("tasks[%d].username is required", i)
		}
		
		if t.Interval <= 0 {
			t.Interval = 300 // 默认 5 分钟
		}

		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		if _, err := url.Parse(t.Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid", i)
		}

		validated = append(validated, t)
	}
	return validated, nil
}