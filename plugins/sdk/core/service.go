package core

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"mew/plugins/sdk/manager"
	"mew/plugins/sdk/mew"
)

type ServiceOptions struct {
	LogPrefix   string
	ServiceType string
	ServerName  string
	Icon        string
	Description string

	// ConfigTemplate is a JSON string shown as the default template when creating a bot.
	// Leave empty to provide no template.
	ConfigTemplate string

	// NewRunner builds a Runner for a single bot instance.
	NewRunner func(botID, botName, accessToken, rawConfig string, cfg RuntimeConfig) (manager.Runner, error)

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

	reg := manager.ServiceTypeRegistration{
		ServiceType:    cfg.ServiceType,
		ServerName:     strings.TrimSpace(opts.ServerName),
		Icon:           strings.TrimSpace(opts.Icon),
		Description:    strings.TrimSpace(opts.Description),
		ConfigTemplate: opts.ConfigTemplate,
	}
	if reg.ServerName == "" {
		reg.ServerName = reg.ServiceType
	}
	mgr := manager.NewBotManagerWithRegistration(client, reg, opts.LogPrefix, func(botID, botName, accessToken, rawConfig string) (manager.Runner, error) {
		return opts.NewRunner(botID, botName, accessToken, rawConfig, cfg)
	})

	log.Printf("%s starting (serviceType=%s apiBase=%s syncInterval=%s)", opts.LogPrefix, cfg.ServiceType, cfg.APIBase, cfg.SyncInterval)
	go mew.RunInfraPresence(ctx, cfg.APIBase, cfg.AdminSecret, cfg.ServiceType, opts.LogPrefix)

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
