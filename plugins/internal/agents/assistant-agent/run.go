package agent

import (
	"mew/plugins/internal/agents/assistant-agent/config"
	"mew/plugins/pkg"
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
			return NewAssistantRunner(RunnerOptions{
				ServiceType: cfg.ServiceType,
				BotID:       botID,
				BotName:     botName,
				AccessToken: accessToken,
				RawConfig:   rawConfig,
				Runtime:     cfg,
			})
		},
	})
}
