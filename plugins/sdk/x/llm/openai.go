package llm

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

const (
	DefaultOpenAIBaseURL           = "https://api.openai.com/v1"
	DefaultOpenAIModel             = "gpt-4o-mini"
	DefaultOpenAIMaxRetries        = 5
	DefaultOpenAIRequestTimeout    = 75 * time.Second
	DefaultOpenAIHTTPClientTimeout = 75 * time.Second
)

type OpenAIChatConfig struct {
	BaseURL string
	APIKey  string
	Model   string

	// SDK client options.
	MaxRetries     int
	RequestTimeout time.Duration
}

func (c OpenAIChatConfig) withDefaults() OpenAIChatConfig {
	out := c
	if strings.TrimSpace(out.BaseURL) == "" {
		out.BaseURL = DefaultOpenAIBaseURL
	}
	if strings.TrimSpace(out.Model) == "" {
		out.Model = DefaultOpenAIModel
	}
	if out.MaxRetries <= 0 {
		out.MaxRetries = DefaultOpenAIMaxRetries
	}
	if out.RequestTimeout <= 0 {
		out.RequestTimeout = DefaultOpenAIRequestTimeout
	}
	return out
}

func NewHTTPClient() *http.Client {
	return &http.Client{Timeout: DefaultOpenAIHTTPClientTimeout}
}

func CallOpenAIChatCompletion(
	ctx context.Context,
	httpClient *http.Client,
	cfg OpenAIChatConfig,
	messages []openaigo.ChatCompletionMessageParamUnion,
	tools []openaigo.ChatCompletionToolUnionParam,
) (*openaigo.ChatCompletion, error) {
	cfg = cfg.withDefaults()
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, fmt.Errorf("api key is required")
	}
	if httpClient == nil {
		httpClient = NewHTTPClient()
	}

	client := openaigo.NewClient(
		option.WithBaseURL(strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")),
		option.WithAPIKey(strings.TrimSpace(cfg.APIKey)),
		option.WithHTTPClient(httpClient),
		option.WithMaxRetries(cfg.MaxRetries),
		option.WithRequestTimeout(cfg.RequestTimeout),
	)

	params := openaigo.ChatCompletionNewParams{
		Model:    openaigo.ChatModel(strings.TrimSpace(cfg.Model)),
		Messages: messages,
	}
	if len(tools) > 0 {
		params.Tools = tools
	}

	return client.Chat.Completions.New(ctx, params)
}
