package engine

import (
	"mew/plugins/pornhub-fetcher/internal/config"
	"mew/plugins/sdk"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username":              "some_user",
			"interval":              43200,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"enabled":               true,
			"send_history_on_start": false,
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
