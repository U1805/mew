package agent

import (
	"mew/plugins/pkg"
)

func Run() error {
	cfgTemplate, err := sdk.ConfigTemplateJSON(map[string]any{
		"chat_model": map[string]any{
			"base_url": map[string]any{
				"type":     "url",
				"desc":     "OpenAI-compatible base URL (e.g. https://api.openai.com/v1)",
				"required": true,
			},
			"api_key": map[string]any{
				"type":     "token",
				"desc":     "API key",
				"required": true,
			},
			"model": map[string]any{
				"type":     "string",
				"desc":     "Model name (e.g. gpt-4o-mini)",
				"required": true,
			},
		},
		"user": map[string]any{
			"user_interests": map[string]any{
				"type":     "string",
				"desc":     "Injected into persona prompt as {{USER_INTERESTS}}",
				"required": false,
			},
			"timezone": map[string]any{
				"type":     "string",
				"desc":     "IANA TZ name or offset (e.g. Asia/Shanghai, +08:00). Empty means default",
				"required": false,
			},
		},
		"tool": map[string]any{
			"exa_api_key": map[string]any{
				"type":     "token",
				"desc":     "Exa API key (optional)",
				"required": false,
			},
			"hobbyist_tts_token": map[string]any{
				"type":     "token",
				"desc":     "Hobbyist TTS token (optional)",
				"required": false,
			},
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
