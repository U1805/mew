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
	sdk.LoadDotEnv("[test-bot]")

	cfg, err := sdk.LoadRuntimeConfig(sdk.ServiceTypeFromCaller())
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("[test-bot] starting (serviceType=%s apiBase=%s syncInterval=%s)", cfg.ServiceType, cfg.APIBase, cfg.SyncInterval)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client, err := sdk.NewMewClient(cfg.APIBase, cfg.AdminSecret)
	if err != nil {
		log.Fatal(err)
	}
	manager := sdk.NewBotManager(client, cfg.ServiceType, "[test-bot]", func(botID, botName, rawConfig string) (sdk.Runner, error) {
		return NewTestBotRunner(botID, botName, rawConfig, cfg.APIBase)
	})

	// Initial sync
	if err := manager.SyncOnce(ctx); err != nil {
		log.Printf("[test-bot] initial sync failed: %v", err)
	}

	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[test-bot] shutting down...")
			manager.StopAll()
			return
		case <-ticker.C:
			if err := manager.SyncOnce(ctx); err != nil {
				log.Printf("[test-bot] sync failed: %v", err)
			}
		}
	}
}
