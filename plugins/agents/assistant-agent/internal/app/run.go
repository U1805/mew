package app

import (
	"mew/plugins/assistant-agent/internal/bot"
	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk"
)

func Run() error {
	cfgTemplate, err := sdk.ConfigTemplateJSON(config.AssistantConfig{
		ChatModel: config.ChatModelConfig{
			BaseURL: "https://api.openai.com/v1",
			APIKey:  "",
			Model:   "gpt-4o-mini",
		},
		User: config.UserConfig{
			UserInterests: "游戏/摇滚乐",
			Timezone:      config.DefaultTimezone,
		},
		Tool: config.ToolConfig{
			ExaAPIKey: "",
		},
	})
	if err != nil {
		return err
	}

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[assistant-agent]",
		ServerName:     "Subaru",
		Description:    "赛博安和昴",
		ConfigTemplate: cfgTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return bot.NewAssistantRunner(cfg.ServiceType, botID, botName, accessToken, rawConfig, cfg)
		},
	})
}
