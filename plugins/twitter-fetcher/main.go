package main

import (
	"log"
	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[tw-bot]",
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewTwitterFetcherRunner(botID, botName, accessToken, rawConfig, cfg.APIBase)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
