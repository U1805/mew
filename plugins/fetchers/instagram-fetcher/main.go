package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[ig-bot]",
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewInstagramFetcherRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}

