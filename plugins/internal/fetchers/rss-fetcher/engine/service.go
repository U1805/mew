package engine

import (
	"mew/plugins/internal/fetchers/rss-fetcher/config"
	"mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"rss_url":               "https://example.com/feed.xml",
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[rss-fetcher-bot]",
		ServerName:     "RSS Bot",
		Description:    "定时抓取 RSS 并通过 webhook 推送",
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
