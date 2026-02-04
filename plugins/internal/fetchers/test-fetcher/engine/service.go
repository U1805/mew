package engine

import (
	"mew/plugins/internal/fetchers/test-fetcher/config"
	sdk "mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"webhook": map[string]any{
				"type":     "url",
				"desc":     "Webhook to target channel",
				"required": true,
			},
			"content": map[string]any{
				"type":     "string",
				"desc":     "Message content to post",
				"required": true,
			},
			"interval": map[string]any{
				"type":     "int",
				"desc":     "Polling interval (seconds). Default: 30",
				"required": false,
			},
			"enabled": map[string]any{
				"type":     "bool",
				"desc":     "Enable this task",
				"required": false,
			},
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
