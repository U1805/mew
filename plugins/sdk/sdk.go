package sdk

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"time"

	"mew/plugins/sdk/collections"
	"mew/plugins/sdk/config"
	"mew/plugins/sdk/core"
	"mew/plugins/sdk/devmode"
	"mew/plugins/sdk/httpx"
	"mew/plugins/sdk/manager"
	"mew/plugins/sdk/mew"
	"mew/plugins/sdk/state"
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

// ---- dev mode ----

func DevModeEnabled() bool { return devmode.Enabled() }

func DevModeDir() string { return devmode.Dir() }

// ---- service runtime ----

type ServiceOptions = core.ServiceOptions

func RunService(ctx context.Context, opts ServiceOptions) error { return core.RunService(ctx, opts) }

func RunServiceWithSignals(opts ServiceOptions) error { return core.RunServiceWithSignals(opts) }

var ErrInvalidRunnerFactory = core.ErrInvalidRunnerFactory

// ---- goroutine group ----

type Group = core.Group

func NewGroup(parent context.Context) *Group { return core.NewGroup(parent) }

func RunInterval(ctx context.Context, interval time.Duration, immediate bool, fn func(ctx context.Context)) {
	core.RunInterval(ctx, interval, immediate, fn)
}

func BoolOrDefault(v *bool, def bool) bool { return core.BoolOrDefault(v, def) }
func IsEnabled(v *bool) bool               { return core.IsEnabled(v) }

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

// ---- config helpers ----

func DecodeTasks[T any](rawConfig string) ([]T, error) { return config.DecodeTasks[T](rawConfig) }

func ValidateHTTPURL(raw string) error { return config.ValidateHTTPURL(raw) }

// ---- http helpers ----

type HTTPClientOptions = httpx.ClientOptions

func NewHTTPClient(opts HTTPClientOptions) (*http.Client, error) { return httpx.NewClient(opts) }

func ProxyFuncFromString(raw string) (func(*http.Request) (*url.URL, error), error) {
	return httpx.ProxyFuncFromString(raw)
}

func RandomBrowserUserAgent() string { return httpx.RandomBrowserUserAgent() }

// ---- state helpers ----

func StateBaseDir() string { return state.BaseDir() }

func BotStateDir(serviceType, botID string) string { return state.BotDir(serviceType, botID) }

func TaskStateFile(serviceType, botID string, idx int, identity string) string {
	return state.TaskFile(serviceType, botID, idx, identity)
}

func LoadJSONFile[T any](path string) (T, error) { return state.LoadJSONFile[T](path) }

func SaveJSONFile(path string, v any) error { return state.SaveJSONFile(path, v) }

type TaskStateStore[T any] struct {
	Path string
}

func OpenTaskState[T any](serviceType, botID string, idx int, identity string) TaskStateStore[T] {
	return TaskStateStore[T]{Path: state.TaskFile(serviceType, botID, idx, identity)}
}

func (s TaskStateStore[T]) Load() (T, error) { return state.LoadJSONFile[T](s.Path) }

func (s TaskStateStore[T]) Save(v T) error { return state.SaveJSONFile(s.Path, v) }

// ---- collections ----

type SeenSet = collections.SeenSet

func NewSeenSet(max int) *SeenSet { return collections.NewSeenSet(max) }

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

func UploadRemoteToWebhook(
	ctx context.Context,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, webhookURL, remoteURL, fallbackFilename string,
) (WebhookAttachment, error) {
	return webhook.UploadRemote(ctx, downloadClient, uploadClient, apiBase, webhookURL, remoteURL, fallbackFilename, RandomBrowserUserAgent())
}

func FilenameFromURL(rawURL, fallback string) string {
	return webhook.FilenameFromURL(rawURL, fallback)
}
