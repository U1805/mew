package config

import (
	"fmt"
	"strings"

	"mew/plugins/pkg"
)

type taskRaw struct {
	Interval           int    `json:"interval"`
	Webhook            string `json:"webhook"`
	RSSURL             string `json:"rss_url"`
	URL                string `json:"url"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
	MaxItemsPerPoll    int    `json:"max_items_per_poll"`
}

type TaskConfig struct {
	Interval int
	Webhook  string
	RSSURL   string
	Enabled  *bool

	SendHistoryOnStart *bool
	MaxItemsPerPoll    int
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
			interval = 5 * 60 // 默认 5 分钟
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		if err := sdk.ValidateHTTPURL(t.Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid: %w", i, err)
		}

		rssURLStr := strings.TrimSpace(t.RSSURL)
		if rssURLStr == "" {
			rssURLStr = strings.TrimSpace(t.URL)
		}
		if rssURLStr == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url (or url) is required", i)
		}
		if err := sdk.ValidateHTTPURL(rssURLStr); err != nil {
			return nil, fmt.Errorf("tasks[%d].rss_url invalid: %w", i, err)
		}

		maxItems := t.MaxItemsPerPoll
		if maxItems <= 0 {
			maxItems = 5
		}
		if maxItems > 20 {
			maxItems = 20
		}

		validated = append(validated, TaskConfig{
			Interval:           interval,
			Webhook:            t.Webhook,
			RSSURL:             rssURLStr,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
			MaxItemsPerPoll:    maxItems,
		})
	}

	return validated, nil
}
