package sdk

import (
	"context"
	"io"
	"net/http"

	"mew/plugins/sdk/core"
	"mew/plugins/sdk/manager"
	"mew/plugins/sdk/mew"
	"mew/plugins/sdk/webhook"
)

// ---- dotenv / config ----

type RuntimeConfig = core.RuntimeConfig

func ServiceTypeFromCaller() string { return core.ServiceTypeFromCaller() }

func ServiceTypeFromCallerSkip(callerSkip int) string {
	return core.ServiceTypeFromCallerSkip(callerSkip)
}

func LoadRuntimeConfig(serviceType string) (RuntimeConfig, error) {
	return core.LoadRuntimeConfig(serviceType)
}

func LoadDotEnv(logPrefix string) { core.LoadDotEnv(logPrefix) }

func LoadDotEnvFromCaller(logPrefix string, callerSkip int) {
	core.LoadDotEnvFromCaller(logPrefix, callerSkip)
}

func IsDotEnvDisabled() bool { return core.IsDotEnvDisabled() }

// ---- service runtime ----

type ServiceOptions = core.ServiceOptions

func RunService(ctx context.Context, opts ServiceOptions) error { return core.RunService(ctx, opts) }

func RunServiceWithSignals(opts ServiceOptions) error { return core.RunServiceWithSignals(opts) }

var ErrInvalidRunnerFactory = core.ErrInvalidRunnerFactory

// ---- goroutine group ----

type Group = core.Group

func NewGroup(parent context.Context) *Group { return core.NewGroup(parent) }

// ---- MEW client ----

type MewClient = mew.Client

type BootstrapBot = mew.BootstrapBot

func NewMewClient(apiBase, adminSecret string) (*MewClient, error) {
	return mew.NewClient(apiBase, adminSecret)
}

// ---- bot manager ----

type Runner = manager.Runner

type RunnerFactory = manager.RunnerFactory

type BotManager = manager.BotManager

func NewBotManager(client *MewClient, serviceType, logPrefix string, factory RunnerFactory) *BotManager {
	return manager.NewBotManager(client, serviceType, logPrefix, factory)
}

// ---- webhook ----

type WebhookPayload = webhook.Payload
type WebhookAttachment = webhook.Attachment

func PostWebhook(ctx context.Context, httpClient *http.Client, apiBase, webhookURL string, payload WebhookPayload, maxRetries int) error {
	return webhook.Post(ctx, httpClient, apiBase, webhookURL, payload, maxRetries)
}

func PostWebhookJSONWithRetry(ctx context.Context, httpClient *http.Client, apiBase, webhookURL string, body []byte, attempts int) error {
	return webhook.PostJSONWithRetry(ctx, httpClient, apiBase, webhookURL, body, attempts)
}

func RewriteLoopbackURL(rawURL, apiBase string) (string, error) {
	return webhook.RewriteLoopbackURL(rawURL, apiBase)
}

func UploadWebhookBytes(ctx context.Context, httpClient *http.Client, apiBase, webhookURL, filename, contentType string, data []byte) (WebhookAttachment, error) {
	return webhook.UploadBytes(ctx, httpClient, apiBase, webhookURL, filename, contentType, data)
}

func UploadWebhookReader(ctx context.Context, httpClient *http.Client, apiBase, webhookURL, filename, contentType string, r io.Reader) (WebhookAttachment, error) {
	return webhook.UploadReader(ctx, httpClient, apiBase, webhookURL, filename, contentType, r)
}
