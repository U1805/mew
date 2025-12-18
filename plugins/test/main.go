package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	adminSecret := strings.TrimSpace(os.Getenv("MEW_ADMIN_SECRET"))
	if adminSecret == "" {
		log.Fatal("MEW_ADMIN_SECRET is required")
	}

	serviceType := strings.TrimSpace(os.Getenv("MEW_SERVICE_TYPE"))
	if serviceType == "" {
		serviceType = "test"
	}

	apiBase := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_API_BASE")), "/")
	if apiBase == "" {
		mewURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_URL")), "/")
		if mewURL == "" {
			mewURL = "http://localhost:3000"
		}
		apiBase = mewURL + "/api"
	}

	syncInterval := 60 * time.Second
	if v := strings.TrimSpace(os.Getenv("MEW_CONFIG_SYNC_INTERVAL_SECONDS")); v != "" {
		secs, err := strconv.Atoi(v)
		if err != nil || secs <= 0 {
			log.Fatalf("invalid MEW_CONFIG_SYNC_INTERVAL_SECONDS: %q", v)
		}
		syncInterval = time.Duration(secs) * time.Second
	}

	log.Printf("[test-bot] starting (serviceType=%s apiBase=%s syncInterval=%s)", serviceType, apiBase, syncInterval)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client := NewMewClient(apiBase, adminSecret)
	manager := NewBotManager(client, serviceType)

	// Initial sync
	if err := manager.SyncOnce(ctx); err != nil {
		log.Printf("[test-bot] initial sync failed: %v", err)
	}

	ticker := time.NewTicker(syncInterval)
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
