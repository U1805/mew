package engine

import (
	"mew/plugins/internal/fetchers/instagram-fetcher/config"
	sdk "mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username": map[string]any{
				"type":     "string",
				"desc":     "Instagram username",
				"required": true,
			},
			"webhook": map[string]any{
				"type":     "url",
				"desc":     "Webhook to target channel",
				"required": true,
			},
			"interval": map[string]any{
				"type":     "int",
				"desc":     "Polling interval (seconds). Default: 3600",
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
		LogPrefix:      "[ig-bot]",
		ServerName:     "Instagram Bot",
		Description:    "定时抓取公开 Stories，发现新条目后通过 webhook 推送（Type: app/x-instagram-card）。",
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
