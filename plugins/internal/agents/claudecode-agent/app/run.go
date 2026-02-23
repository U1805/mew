package app

import (
	agent "mew/plugins/internal/agents/claudecode-agent/agent"
	"mew/plugins/pkg"
)

func Run() error {
	cfgTemplate, err := sdk.ConfigTemplateJSON(map[string]any{})
	if err != nil {
		return err
	}

	return sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:      "[claudecode-agent]",
		ServerName:     "Claude Code",
		Description:    "通过 Claude Code CLI 对话（支持 /clear）",
		ConfigTemplate: cfgTemplate,
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return agent.NewClaudeCodeRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	})
}
