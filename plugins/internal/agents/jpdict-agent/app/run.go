package app

import (
	"mew/plugins/internal/agents/jpdict-agent/agent"
	"mew/plugins/internal/agents/jpdict-agent/config"
	"mew/plugins/pkg"
)

func Run() error {
	cfgTemplate, err := sdk.ConfigTemplateJSON(config.JpdictConfig{
		BaseURL: "https://api.openai.com/v1",
		APIKey:  "",
		Model:   "gpt-4o-mini",
	})
	if err != nil {
		return err
	}

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[jpdict-agent]",
		ServerName:     "Unown",
		Description:    "日语全能学习助手：直接输入文本/图片，自动在词典模式与翻译解析模式间切换（回复为词典卡片）。",
		ConfigTemplate: cfgTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return agent.NewJpdictRunner(cfg.ServiceType, botID, botName, accessToken, rawConfig, cfg)
		},
	})
}
