package core

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mew/plugins/sdk/manager"
	"mew/plugins/sdk/mew"
)

type ServiceOptions struct {
	LogPrefix   string
	ServiceType string

	// NewRunner builds a Runner for a single bot instance.
	NewRunner func(botID, botName, rawConfig string, cfg RuntimeConfig) (manager.Runner, error)

	// DisableDotEnv disables `.env` loading (MEW_DOTENV also disables it).
	DisableDotEnv bool

	// DisableInitialSync disables the initial bootstrap sync on startup.
	DisableInitialSync bool

	// SyncInterval overrides cfg.SyncInterval when > 0.
	SyncInterval time.Duration
}

func RunService(ctx context.Context, opts ServiceOptions) error {
	if opts.LogPrefix == "" {
		opts.LogPrefix = "[bot]"
	}

	if !opts.DisableDotEnv {
		LoadDotEnvFromCaller(opts.LogPrefix, nonSDKCallerSkip(2))
	}

	serviceType := opts.ServiceType
	if serviceType == "" {
		serviceType = ServiceTypeFromCallerSkip(nonSDKCallerSkip(2))
	}

	cfg, err := LoadRuntimeConfig(serviceType)
	if err != nil {
		return err
	}

	if opts.SyncInterval > 0 {
		cfg.SyncInterval = opts.SyncInterval
	}

	client, err := mew.NewClient(cfg.APIBase, cfg.AdminSecret)
	if err != nil {
		return err
	}

	if opts.NewRunner == nil {
		return ErrInvalidRunnerFactory
	}

	mgr := manager.NewBotManager(client, cfg.ServiceType, opts.LogPrefix, func(botID, botName, rawConfig string) (manager.Runner, error) {
		return opts.NewRunner(botID, botName, rawConfig, cfg)
	})

	log.Printf("%s starting (serviceType=%s apiBase=%s syncInterval=%s)", opts.LogPrefix, cfg.ServiceType, cfg.APIBase, cfg.SyncInterval)

	if !opts.DisableInitialSync {
		if err := mgr.SyncOnce(ctx); err != nil {
			log.Printf("%s initial sync failed: %v", opts.LogPrefix, err)
		}
	}

	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("%s shutting down...", opts.LogPrefix)
			mgr.StopAll()
			return nil
		case <-ticker.C:
			if err := mgr.SyncOnce(ctx); err != nil {
				log.Printf("%s sync failed: %v", opts.LogPrefix, err)
			}
		}
	}
}

func RunServiceWithSignals(opts ServiceOptions) error {
	if opts.LogPrefix == "" {
		opts.LogPrefix = "[bot]"
	}

	if !opts.DisableDotEnv {
		LoadDotEnvFromCaller(opts.LogPrefix, nonSDKCallerSkip(2))
		opts.DisableDotEnv = true
	}

	if opts.ServiceType == "" {
		opts.ServiceType = ServiceTypeFromCallerSkip(nonSDKCallerSkip(2))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return RunService(ctx, opts)
}
