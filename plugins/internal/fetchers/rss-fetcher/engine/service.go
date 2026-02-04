package engine

import (
	"mew/plugins/internal/fetchers/rss-fetcher/config"
	sdk "mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"rss_url": map[string]any{
				"type":     "url",
				"desc":     "RSS feed URL",
				"required": true,
			},
			"webhook": map[string]any{
				"type":     "url",
				"desc":     "Webhook to target channel",
				"required": true,
			},
			"interval": map[string]any{
				"type":     "int",
				"desc":     "Polling interval (seconds). Default: 300",
				"required": false,
			},
			"enabled": map[string]any{
				"type":     "bool",
				"desc":     "Enable this task",
				"required": false,
			},
			"send_history_on_start": map[string]any{
				"type":     "bool",
				"desc":     "Send recent history on startup",
				"required": false,
			},
			"max_items_per_poll": map[string]any{
				"type":     "int",
				"desc":     "Max items per poll (1..20). Default: 5",
				"required": false,
			},
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[rss-fetcher-bot]",
		ServerName:     "RSS Bot",
		Description:    "定时抓取 RSS 并通过 webhook 推送",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			tasks, err := config.ParseTasks(rawConfig)
			if err != nil {
				return nil, err
			}
			return NewRunner(botID, botName, accessToken, cfg, tasks), nil
		},
	})
}
