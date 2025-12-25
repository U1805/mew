package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"uid":                   "2",
			"interval":              300,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"enabled":               true,
			"send_history_on_start": false,
		},
	})

	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[bili-fetcher]",
		ServerName:     "Bilibili Bot",
		Description:    "定时抓取指定 UID 的动态列表，发现新动态后通过 webhook 推送（Type: app/x-bilibili-card）。",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewBiliBotRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
