package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"interval":              3600,
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
			"rss_url":               "https://example.com/feed.xml",
			"enabled":               true,
			"send_history_on_start": false,
			"max_items_per_poll":    5,
		},
	})
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[rss-fetcher-bot]",
		ServerName:     "RSS Bot",
		Description:    "定时抓取 RSS 并通过 webhook 推送",
		ConfigTemplate: configTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewRSSFetcherBotRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
