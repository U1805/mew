package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type TestTaskConfig struct {
	Interval int    `json:"interval"`
	Webhook  string `json:"webhook"`
	Content  string `json:"content"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

func parseTasks(rawConfig string) ([]TestTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	var tasks []TestTaskConfig
	if err := json.Unmarshal([]byte(rawConfig), &tasks); err != nil {
		// Support single object for backward compatibility
		var singleTask TestTaskConfig
		if err2 := json.Unmarshal([]byte(rawConfig), &singleTask); err2 == nil {
			tasks = []TestTaskConfig{singleTask}
		} else {
			return nil, fmt.Errorf("config must be a JSON array or a single object: %w", err)
		}
	}

	validated := make([]TestTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if t.Interval <= 0 {
			return nil, fmt.Errorf("tasks[%d].interval must be > 0", i)
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		u, err := url.Parse(t.Webhook)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return nil, fmt.Errorf("tasks[%d].webhook must be a valid URL", i)
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].webhook must be http/https", i)
		}
		validated = append(validated, t)
	}

	return validated, nil
}
