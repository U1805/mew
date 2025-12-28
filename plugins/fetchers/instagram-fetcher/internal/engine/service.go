package engine

import (
	"mew/plugins/instagram-fetcher/internal/config"
	"mew/plugins/sdk"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username":              "xxxxxx",
			"interval":              3600,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"enabled":               true,
			"send_history_on_start": false,
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
