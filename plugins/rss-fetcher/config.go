package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type rssTaskRaw struct {
	Interval           int    `json:"interval"`
	IntervalSeconds    int    `json:"interval_seconds"`
	Webhook            string `json:"webhook"`
	RSSURL             string `json:"rss_url"`
	URL                string `json:"url"`
	Enabled            *bool  `json:"enabled"`
	SendHistoryOnStart *bool  `json:"send_history_on_start"`
	MaxItemsPerPoll    int    `json:"max_items_per_poll"`
	UserAgent          string `json:"user_agent"`
}

type rssConfigWrapper struct {
	Tasks []rssTaskRaw `json:"tasks"`
}

type RSSFetchTaskConfig struct {
	IntervalSeconds    int
	Webhook            string
	RSSURL             string
	Enabled            *bool
	SendHistoryOnStart *bool
	MaxItemsPerPoll    int
	UserAgent          string
}

func parseRSSTasks(rawConfig string) ([]RSSFetchTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	var rawAny any
	if err := json.Unmarshal([]byte(rawConfig), &rawAny); err != nil {
		return nil, fmt.Errorf("config must be valid JSON: %w", err)
	}

	var rawTasks []rssTaskRaw
	switch rawAny.(type) {
	case []any:
		if err := json.Unmarshal([]byte(rawConfig), &rawTasks); err != nil {
			return nil, fmt.Errorf("config array decode failed: %w", err)
		}
	case map[string]any:
		var wrapper rssConfigWrapper
		if err := json.Unmarshal([]byte(rawConfig), &wrapper); err != nil {
			return nil, fmt.Errorf("config object decode failed: %w", err)
		}
		if len(wrapper.Tasks) > 0 {
			rawTasks = wrapper.Tasks
		} else {
			var single rssTaskRaw
			if err := json.Unmarshal([]byte(rawConfig), &single); err != nil {
				return nil, fmt.Errorf("config single task decode failed: %w", err)
			}
			rawTasks = []rssTaskRaw{single}
		}
	default:
		return nil, fmt.Errorf("config must be a JSON array or object")
	}

	validated := make([]RSSFetchTaskConfig, 0, len(rawTasks))
	for i, t := range rawTasks {
		interval := t.IntervalSeconds
		if interval <= 0 {
			interval = t.Interval
		}
		if interval <= 0 {
			return nil, fmt.Errorf("tasks[%d].interval(_seconds) must be > 0", i)
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		webhookURL, err := url.Parse(t.Webhook)
		if err != nil || webhookURL.Scheme == "" || webhookURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].webhook must be a valid URL", i)
		}
		if webhookURL.Scheme != "http" && webhookURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].webhook must be http/https", i)
		}

		rssURLStr := strings.TrimSpace(t.RSSURL)
		if rssURLStr == "" {
			rssURLStr = strings.TrimSpace(t.URL)
		}
		if rssURLStr == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url (or url) is required", i)
		}
		rssURL, err := url.Parse(rssURLStr)
		if err != nil || rssURL.Scheme == "" || rssURL.Host == "" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be a valid URL", i)
		}
		if rssURL.Scheme != "http" && rssURL.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].rss_url must be http/https", i)
		}

		maxItems := t.MaxItemsPerPoll
		if maxItems <= 0 {
			maxItems = 5
		}
		if maxItems > 20 {
			maxItems = 20
		}

		userAgent := strings.TrimSpace(t.UserAgent)
		if userAgent == "" {
			userAgent = "mew-rss-fetcher-bot/1.0"
		}

		validated = append(validated, RSSFetchTaskConfig{
			IntervalSeconds:    interval,
			Webhook:            t.Webhook,
			RSSURL:             rssURLStr,
			Enabled:            t.Enabled,
			SendHistoryOnStart: t.SendHistoryOnStart,
			MaxItemsPerPoll:    maxItems,
			UserAgent:          userAgent,
		})
	}

	return validated, nil
}
