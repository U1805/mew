package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	openaigo "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"

	"mew/plugins/assistant-agent/internal/config"
)

func NewHTTPClient() *http.Client {
	return &http.Client{Timeout: DefaultChatHTTPTimeout}
}

func CallChatCompletion(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, messages []openaigo.ChatCompletionMessageParamUnion, tools []openaigo.ChatCompletionToolUnionParam) (*openaigo.ChatCompletion, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = DefaultModel
	}

	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, fmt.Errorf("assistant-agent config incomplete: api_key is required")
	}
	if httpClient == nil {
		httpClient = NewHTTPClient()
	}

	client := openaigo.NewClient(
		option.WithBaseURL(baseURL),
		option.WithAPIKey(strings.TrimSpace(cfg.APIKey)),
		option.WithHTTPClient(httpClient),
		option.WithMaxRetries(MaxRetries),
		option.WithRequestTimeout(DefaultChatHTTPTimeout),
	)

	params := openaigo.ChatCompletionNewParams{
		Model:    openaigo.ChatModel(model),
		Messages: messages,
	}
	if len(tools) > 0 {
		params.Tools = tools
	}

	return client.Chat.Completions.New(ctx, params)
}
