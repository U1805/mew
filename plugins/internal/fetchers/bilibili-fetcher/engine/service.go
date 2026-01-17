package engine

import (
	"mew/plugins/internal/fetchers/bilibili-fetcher/config"
	"mew/plugins/pkg"
)

func RunService() error {
	configTemplate, _ := sdk.ConfigTemplateJSON([]any{
		map[string]any{
			"uid":                   "2",
			"webhook":               "http://mew-server/api/webhooks/<webhookId>/<token>",
		},
	})

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[bili-fetcher]",
		ServerName:     "Bilibili Bot",
		Description:    "定时抓取指定 UID 的动态列表，发现新动态后通过 webhook 推送（Type: app/x-bilibili-card）。",
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
