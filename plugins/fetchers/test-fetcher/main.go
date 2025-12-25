package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"interval": 30,
			"webhook":  "http://mew-server/api/webhooks/<webhookId>/<token>",
			"content":  "test message",
			"enabled":  true,
		},
	})

	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[test-bot]",
		ServerName:     "Test Bot",
		Description:    "示例 Fetcher：按 interval 周期向 webhook 发送 content（用于验证 bot 生态链路）。",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewTestBotRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
