package sdk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	sdkapi "mew/plugins/sdk/api"
	"mew/plugins/sdk/api/auth"
	"mew/plugins/sdk/api/channels"
	apiclient "mew/plugins/sdk/api/client"
	"mew/plugins/sdk/api/messages"
	"mew/plugins/sdk/api/webhook"
	"mew/plugins/sdk/runtime"
	"mew/plugins/sdk/state"
	"mew/plugins/sdk/x/devmode"
	"mew/plugins/sdk/x/htmlutil"
	"mew/plugins/sdk/x/httpx"
	"mew/plugins/sdk/x/misc"
	"mew/plugins/sdk/x/ptr"
	"mew/plugins/sdk/x/syncx"
	timeutil "mew/plugins/sdk/x/timeutil"
)

// ---- dotenv / config ----

type RuntimeConfig = runtime.RuntimeConfig

func ServiceTypeFromCaller() string { return runtime.ServiceTypeFromCaller() }

func ServiceTypeFromCallerSkip(callerSkip int) string {
	return runtime.ServiceTypeFromCallerSkip(callerSkip)
}

func MewURLFromEnvOrAPIBase(apiBase, fallback string) string {
	return runtime.MewURLFromEnvOrAPIBase(apiBase, fallback)
}

func LoadRuntimeConfig(serviceType string) (RuntimeConfig, error) {
	return runtime.LoadRuntimeConfig(serviceType)
}

func LoadDotEnv(logPrefix string) { runtime.LoadDotEnv(logPrefix) }

func LoadDotEnvFromCaller(logPrefix string, callerSkip int) {
	runtime.LoadDotEnvFromCaller(logPrefix, callerSkip)
}

func IsDotEnvDisabled() bool { return runtime.IsDotEnvDisabled() }

// ---- dev mode ----

func DevModeEnabled() bool { return devmode.Enabled() }

func DevModeDir() string { return devmode.Dir() }

// ---- service runtime ----

type ServiceOptions = runtime.ServiceOptions

func RunService(ctx context.Context, opts ServiceOptions) error { return runtime.RunService(ctx, opts) }

func RunServiceWithSignals(opts ServiceOptions) error { return runtime.RunServiceWithSignals(opts) }

var ErrInvalidRunnerFactory = runtime.ErrInvalidRunnerFactory

// ---- goroutine group ----

type Group = syncx.Group

func NewGroup(parent context.Context) *Group { return syncx.NewGroup(parent) }

func RunInterval(ctx context.Context, interval time.Duration, immediate bool, fn func(ctx context.Context)) {
	syncx.RunInterval(ctx, interval, immediate, fn)
}

func BoolOrDefault(v *bool, def bool) bool { return ptr.BoolOrDefault(v, def) }
func IsEnabled(v *bool) bool               { return ptr.IsEnabled(v) }

func PreviewString(s string, maxRunes int) string { return misc.PreviewString(s, maxRunes) }
func CleanText(s string) string                   { return htmlutil.CleanText(s) }
func FirstImageURLFromHTML(htmlStr, baseURL string) string {
	return htmlutil.FirstImageURLFromHTML(htmlStr, baseURL)
}
func NormalizeMaybeURL(raw, baseURL string) string { return htmlutil.NormalizeMaybeURL(raw, baseURL) }

func HumanizeDuration(d time.Duration) string { return timeutil.HumanizeDuration(d) }

func CandidateDataFilePaths(filename string) []string { return misc.CandidateDataFilePaths(filename) }

// ---- MEW client ----

type MewClient = apiclient.Client

type BootstrapBot = apiclient.BootstrapBot

func NewMewClient(apiBase, adminSecret string) (*MewClient, error) {
	return apiclient.NewClient(apiBase, adminSecret)
}

type BotSession = runtime.BotSession

func NewBotSession(apiBase, accessToken string, httpClient *http.Client) *BotSession {
	return runtime.NewBotSession(apiBase, accessToken, httpClient)
}

// ---- bot manager ----

type Runner = runtime.Runner

type RunnerFactory = runtime.RunnerFactory

type BotManager = runtime.BotManager

func NewBotManager(client *MewClient, serviceType, logPrefix string, factory RunnerFactory) *BotManager {
	return runtime.NewBotManager(client, serviceType, logPrefix, factory)
}

type ServiceTypeRegistration = runtime.ServiceTypeRegistration

func NewBotManagerWithRegistration(client *MewClient, reg ServiceTypeRegistration, logPrefix string, factory RunnerFactory) *BotManager {
	return runtime.NewBotManagerWithRegistration(client, reg, logPrefix, factory)
}

// ---- config helpers ----

func DecodeTasks[T any](rawConfig string) ([]T, error) { return runtime.DecodeTasks[T](rawConfig) }

func ValidateHTTPURL(raw string) error { return runtime.ValidateHTTPURL(raw) }

func ConfigTemplateJSON(v any) (string, error) { return runtime.TemplateJSON(v) }

func TaskConfigTemplateJSON[T any]() (string, error) { return runtime.TaskTemplateJSON[T]() }

// ---- http helpers ----

type HTTPClientOptions = httpx.ClientOptions

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
	c, err := httpx.NewClient(opts)
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

func SaveJSONFileIndented(path string, v any) error { return state.SaveJSONFileIndented(path, v) }

type TaskStateStore[T any] struct {
	Path string
}

func OpenTaskState[T any](serviceType, botID string, idx int, identity string) TaskStateStore[T] {
	return TaskStateStore[T]{Path: state.TaskFile(serviceType, botID, idx, identity)}
}

func (s TaskStateStore[T]) Load() (T, error) { return state.LoadJSONFile[T](s.Path) }

func (s TaskStateStore[T]) Save(v T) error { return state.SaveJSONFile(s.Path, v) }

// ---- collections ----

type SeenSet = state.SeenSet

func NewSeenSet(max int) *SeenSet { return state.NewSeenSet(max) }

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

	type User = sdkapi.User

func NewMewUserHTTPClient() (*http.Client, error) { return apiclient.NewUserHTTPClient() }

func LoginBot(ctx context.Context, httpClient *http.Client, apiBase, accessToken string) (User, string, error) {
	return auth.LoginBot(ctx, httpClient, apiBase, accessToken)
}

func Refresh(ctx context.Context, httpClient *http.Client, apiBase string) (User, string, error) {
	return auth.Refresh(ctx, httpClient, apiBase)
}

func FetchDMChannels(ctx context.Context, httpClient *http.Client, apiBase, userToken string) (map[string]struct{}, error) {
	return channels.FetchDMChannels(ctx, httpClient, apiBase, userToken)
}

type ChannelMessage = sdkapi.ChannelMessage

func FetchChannelMessages(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID string,
	limit int,
	before string,
) ([]ChannelMessage, error) {
	return messages.FetchChannelMessages(ctx, httpClient, apiBase, userToken, channelID, limit, before)
}

func SearchChannelMessages(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID, query string,
	limit, page int,
) ([]ChannelMessage, error) {
	return messages.SearchChannelMessages(ctx, httpClient, apiBase, userToken, channelID, query, limit, page)
}

func AuthorID(authorRaw json.RawMessage) string { return sdkapi.AuthorID(authorRaw) }

func AuthorUsername(authorRaw json.RawMessage) string { return sdkapi.AuthorUsername(authorRaw) }

func IsOwnMessage(authorRaw json.RawMessage, botUserID string) bool {
	return sdkapi.IsOwnMessage(authorRaw, botUserID)
}

type DMChannelCache = runtime.DMChannelCache

func NewDMChannelCache() *DMChannelCache { return runtime.NewDMChannelCache() }
