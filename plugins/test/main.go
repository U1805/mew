package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[test-bot]",
		NewRunner: func(botID, botName, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewTestBotRunner(botID, botName, rawConfig, cfg.APIBase)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
