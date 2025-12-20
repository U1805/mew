package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[rss-fetcher-bot]",
		NewRunner: func(botID, botName, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewRSSFetcherBotRunner(botID, botName, rawConfig, cfg.APIBase)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
