package main

import (
	"log"
	"mew/plugins/sdk"
)

func main() {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username":              "kurusurindesu",
			"interval":              3600,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"enabled":               true,
			"send_history_on_start": false,
		},
	})

	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[tw-bot]",
		ServerName:     "Twitter Bot",
		Description:    "定时抓取公开时间线，发现新 Tweet 后通过 webhook 推送（Type: app/x-twitter-card）。",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewTwitterFetcherRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
