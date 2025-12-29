package engine

import (
	"mew/plugins/sdk"
	"mew/plugins/twitter-fetcher/internal/config"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username":              "xxxx",
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[tw-bot]",
		ServerName:     "Twitter Bot",
		Description:    "定时抓取公开时间线，发现新 Tweet 后通过 webhook 推送（Type: app/x-twitter-card）。",
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
