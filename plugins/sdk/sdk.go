package sdk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"mew/plugins/sdk/client"
	"mew/plugins/sdk/client/webhook"
	"mew/plugins/sdk/engine"
	"mew/plugins/sdk/store"
	"mew/plugins/sdk/util"
	"mew/plugins/sdk/util/devmode"
	"mew/plugins/sdk/util/html"
	"mew/plugins/sdk/util/httpclient"
	timeutil "mew/plugins/sdk/util/time"
)

// ---- dotenv / config ----

type RuntimeConfig = engine.RuntimeConfig

func ServiceTypeFromCaller() string { return engine.ServiceTypeFromCaller() }

func ServiceTypeFromCallerSkip(callerSkip int) string {
	return engine.ServiceTypeFromCallerSkip(callerSkip)
}

func MewURLFromEnvOrAPIBase(apiBase, fallback string) string {
	return engine.MewURLFromEnvOrAPIBase(apiBase, fallback)
}

func LoadRuntimeConfig(serviceType string) (RuntimeConfig, error) {
	return engine.LoadRuntimeConfig(serviceType)
}

func LoadDotEnv(logPrefix string) { engine.LoadDotEnv(logPrefix) }

func LoadDotEnvFromCaller(logPrefix string, callerSkip int) {
	engine.LoadDotEnvFromCaller(logPrefix, callerSkip)
}

func IsDotEnvDisabled() bool { return engine.IsDotEnvDisabled() }

// ---- dev mode ----

func DevModeEnabled() bool { return devmode.Enabled() }

func DevModeDir() string { return devmode.Dir() }

// ---- service runtime ----

type ServiceOptions = engine.ServiceOptions

func RunService(ctx context.Context, opts ServiceOptions) error { return engine.RunService(ctx, opts) }

func RunServiceWithSignals(opts ServiceOptions) error { return engine.RunServiceWithSignals(opts) }

var ErrInvalidRunnerFactory = engine.ErrInvalidRunnerFactory

// ---- goroutine group ----

type Group = util.Group

func NewGroup(parent context.Context) *Group { return util.NewGroup(parent) }

func RunInterval(ctx context.Context, interval time.Duration, immediate bool, fn func(ctx context.Context)) {
	util.RunInterval(ctx, interval, immediate, fn)
}

func BoolOrDefault(v *bool, def bool) bool { return util.BoolOrDefault(v, def) }
func IsEnabled(v *bool) bool               { return util.IsEnabled(v) }

func PreviewString(s string, maxRunes int) string { return util.PreviewString(s, maxRunes) }
func CleanText(s string) string                   { return html.CleanText(s) }
func FirstImageURLFromHTML(htmlStr, baseURL string) string {
	return html.FirstImageURLFromHTML(htmlStr, baseURL)
}
func NormalizeMaybeURL(raw, baseURL string) string { return html.NormalizeMaybeURL(raw, baseURL) }

func HumanizeDuration(d time.Duration) string { return timeutil.HumanizeDuration(d) }

func CandidateDataFilePaths(filename string) []string { return util.CandidateDataFilePaths(filename) }

// ---- MEW client ----

type MewClient = client.Client

type BootstrapBot = client.BootstrapBot

func NewMewClient(apiBase, adminSecret string) (*MewClient, error) {
	return client.NewClient(apiBase, adminSecret)
}

// ---- bot manager ----

type Runner = engine.Runner

type RunnerFactory = engine.RunnerFactory

type BotManager = engine.BotManager

func NewBotManager(client *MewClient, serviceType, logPrefix string, factory RunnerFactory) *BotManager {
	return engine.NewBotManager(client, serviceType, logPrefix, factory)
}

type ServiceTypeRegistration = engine.ServiceTypeRegistration

func NewBotManagerWithRegistration(client *MewClient, reg ServiceTypeRegistration, logPrefix string, factory RunnerFactory) *BotManager {
	return engine.NewBotManagerWithRegistration(client, reg, logPrefix, factory)
}

// ---- config helpers ----

func DecodeTasks[T any](rawConfig string) ([]T, error) { return engine.DecodeTasks[T](rawConfig) }

func ValidateHTTPURL(raw string) error { return engine.ValidateHTTPURL(raw) }

func ConfigTemplateJSON(v any) (string, error) { return engine.TemplateJSON(v) }

func TaskConfigTemplateJSON[T any]() (string, error) { return engine.TaskTemplateJSON[T]() }

// ---- http helpers ----

type HTTPClientOptions = httpclient.ClientOptions

type stripUserAgentRoundTripper struct {
	base http.RoundTripper
}

func (t *stripUserAgentRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if t == nil || t.base == nil {
		return http.DefaultTransport.RoundTrip(req)
	}
	if req == nil {
		return t.base.RoundTrip(req)
	}
	r2 := req.Clone(req.Context())
	// openai-go 请求时默认带 User-Agent: OpenAI/Go 3.15.0, 会导致无法通过 cloudflare
	r2.Header.Del("User-Agent")
	return t.base.RoundTrip(r2)
}

func NewHTTPClient(opts HTTPClientOptions) (*http.Client, error) {
	c, err := httpclient.NewClient(opts)
	if err != nil {
		return nil, err
	}
	if c.Transport == nil {
		c.Transport = http.DefaultTransport
	}
	if _, ok := c.Transport.(*stripUserAgentRoundTripper); !ok {
		c.Transport = &stripUserAgentRoundTripper{base: c.Transport}
	}
	return c, nil
}

func ProxyFuncFromString(raw string) (func(*http.Request) (*url.URL, error), error) {
	return httpclient.ProxyFuncFromString(raw)
}

func RandomBrowserUserAgent() string { return httpclient.RandomBrowserUserAgent() }

// ---- state helpers ----

func StateBaseDir() string { return store.BaseDir() }

func BotStateDir(serviceType, botID string) string { return store.BotDir(serviceType, botID) }

func TaskStateFile(serviceType, botID string, idx int, identity string) string {
	return store.TaskFile(serviceType, botID, idx, identity)
}

func LoadJSONFile[T any](path string) (T, error) { return store.LoadJSONFile[T](path) }

func SaveJSONFile(path string, v any) error { return store.SaveJSONFile(path, v) }

func SaveJSONFileIndented(path string, v any) error { return store.SaveJSONFileIndented(path, v) }

type TaskStateStore[T any] struct {
	Path string
}

func OpenTaskState[T any](serviceType, botID string, idx int, identity string) TaskStateStore[T] {
	return TaskStateStore[T]{Path: store.TaskFile(serviceType, botID, idx, identity)}
}

func (s TaskStateStore[T]) Load() (T, error) { return store.LoadJSONFile[T](s.Path) }

func (s TaskStateStore[T]) Save(v T) error { return store.SaveJSONFile(s.Path, v) }

// ---- collections ----

type SeenSet = store.SeenSet

func NewSeenSet(max int) *SeenSet { return store.NewSeenSet(max) }

// ---- webhook ----

type WebhookPayload = webhook.Payload
type WebhookAttachment = webhook.Attachment
type MediaCache = webhook.MediaCache

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
	userAgent ...string,
) (WebhookAttachment, error) {
	ua := ""
	if len(userAgent) > 0 {
		ua = strings.TrimSpace(userAgent[0])
	}
	if ua == "" {
		ua = RandomBrowserUserAgent()
	}
	return webhook.UploadRemote(ctx, downloadClient, uploadClient, apiBase, webhookURL, remoteURL, fallbackFilename, ua)
}

func UploadRemoteToWebhookCached(
	ctx context.Context,
	cache MediaCache,
	downloadClient *http.Client,
	uploadClient *http.Client,
	apiBase, webhookURL, remoteURL, fallbackFilename string,
	userAgent ...string,
) (key string, usedCache bool, err error) {
	ua := ""
	if len(userAgent) > 0 {
		ua = strings.TrimSpace(userAgent[0])
	}
	if ua == "" {
		ua = RandomBrowserUserAgent()
	}
	return webhook.UploadRemoteKeyCached(ctx, cache, downloadClient, uploadClient, apiBase, webhookURL, remoteURL, fallbackFilename, ua)
}

func FilenameFromURL(rawURL, fallback string) string {
	return webhook.FilenameFromURL(rawURL, fallback)
}

// ---- MEW user helpers ----

type User = client.User

func NewMewUserHTTPClient() (*http.Client, error) { return client.NewUserHTTPClient() }

func LoginBot(ctx context.Context, httpClient *http.Client, apiBase, accessToken string) (User, string, error) {
	return client.LoginBot(ctx, httpClient, apiBase, accessToken)
}

func FetchDMChannels(ctx context.Context, httpClient *http.Client, apiBase, userToken string) (map[string]struct{}, error) {
	return client.FetchDMChannels(ctx, httpClient, apiBase, userToken)
}

type ChannelMessage = client.ChannelMessage

func FetchChannelMessages(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID string,
	limit int,
	before string,
) ([]ChannelMessage, error) {
	return client.FetchChannelMessages(ctx, httpClient, apiBase, userToken, channelID, limit, before)
}

func SearchChannelMessages(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID, query string,
	limit, page int,
) ([]ChannelMessage, error) {
	return client.SearchChannelMessages(ctx, httpClient, apiBase, userToken, channelID, query, limit, page)
}

func AuthorID(authorRaw json.RawMessage) string { return client.AuthorID(authorRaw) }

func AuthorUsername(authorRaw json.RawMessage) string { return client.AuthorUsername(authorRaw) }

func IsOwnMessage(authorRaw json.RawMessage, botUserID string) bool {
	return client.IsOwnMessage(authorRaw, botUserID)
}

type DMChannelCache = client.DMChannelCache

func NewDMChannelCache() *DMChannelCache { return client.NewDMChannelCache() }
