package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"username":              "nirei_nozomi_official",
			"interval":              3600,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"enabled":               true,
			"send_history_on_start": false,
		},
	})

	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[ig-bot]",
		ServerName:     "Instagram Bot",
		Description:    "定时抓取公开 Stories，发现新条目后通过 webhook 推送（Type: app/x-instagram-card）。",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewInstagramFetcherRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
