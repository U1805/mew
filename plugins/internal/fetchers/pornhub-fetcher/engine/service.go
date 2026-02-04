package engine

import (
	"mew/plugins/internal/fetchers/pornhub-fetcher/config"
	sdk "mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username": map[string]any{
				"type":     "string",
				"desc":     "Pornhub username",
				"required": true,
			},
			"webhook": map[string]any{
				"type":     "url",
				"desc":     "Webhook to target channel",
				"required": true,
			},
			"interval": map[string]any{
				"type":     "int",
				"desc":     "Polling interval (seconds). Default: 43200",
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
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[ph-bot]",
		ServerName:     "Pornhub Bot",
		Description:    "定时抓取 Pornhub model 视频列表，发现新视频后通过 webhook 推送（Type: app/x-pornhub-card）。",
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
