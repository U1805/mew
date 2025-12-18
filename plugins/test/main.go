package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	loadDotEnv()

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

func loadDotEnv() {
	if isDotEnvDisabled() {
		return
	}

	// Prefer local overrides, then defaults.
	paths := []string{".env.local", ".env"}

	// When running from repo root (e.g. `go run ./plugins/test`), also try the plugin directory.
	if _, file, _, ok := runtime.Caller(0); ok {
		dir := filepath.Dir(file)
		paths = append(paths, filepath.Join(dir, ".env.local"), filepath.Join(dir, ".env"))
	}

	for _, p := range paths {
		if err := godotenv.Load(p); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			log.Fatalf("failed to load %s: %v", p, err)
		} else {
			log.Printf("[test-bot] loaded env from %s", p)
		}
	}
}

func isDotEnvDisabled() bool {
	v := strings.TrimSpace(os.Getenv("MEW_DOTENV"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "0", "false", "off", "no":
		return true
	default:
		return false
	}
}
