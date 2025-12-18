package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mew/plugins/sdk"
)

func main() {
	sdk.LoadDotEnv("[rss-fetcher-bot]")

	cfg, err := sdk.LoadRuntimeConfig(sdk.ServiceTypeFromCaller())
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("[rss-fetcher-bot] starting (serviceType=%s apiBase=%s syncInterval=%s)", cfg.ServiceType, cfg.APIBase, cfg.SyncInterval)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client := sdk.NewMewClient(cfg.APIBase, cfg.AdminSecret)
	manager := sdk.NewBotManager(client, cfg.ServiceType, "[rss-fetcher-bot]", func(botID, botName, rawConfig string) (sdk.Runner, error) {
		return NewRSSFetcherBotRunner(botID, botName, rawConfig)
	})

	if err := manager.SyncOnce(ctx); err != nil {
		log.Printf("[rss-fetcher-bot] initial sync failed: %v", err)
	}

	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[rss-fetcher-bot] shutting down...")
			manager.StopAll()
			return
		case <-ticker.C:
			if err := manager.SyncOnce(ctx); err != nil {
				log.Printf("[rss-fetcher-bot] sync failed: %v", err)
			}
		}
	}
}
