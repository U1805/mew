package engine

import (
	"mew/plugins/sdk"
	"mew/plugins/test/internal/config"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"interval": 30,
			"webhook":  "http://mew-server/api/webhooks/<webhookId>/<token>",
			"content":  "test message",
			"enabled":  true,
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[test-bot]",
		ServerName:     "Test Bot",
		Description:    "示例 Fetcher：按 interval 周期向 webhook 发送 content（用于验证 bot 生态链路）。",
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
