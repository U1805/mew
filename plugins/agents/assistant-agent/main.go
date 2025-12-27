package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	cfgTemplate, err := sdk.ConfigTemplateJSON(AssistantConfig{
		BaseURL: "https://api.openai.com/v1",
		APIKey:  "",
		Model:   "gpt-4o-mini",
	})
	if err != nil {
		log.Fatal(err)
	}

	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[assistant-agent]",
		ServerName:     "Subaru",
		Description:    "赛博安和昴",
		ConfigTemplate: cfgTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewAssistantRunner(cfg.ServiceType, botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
