package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	sdkapi "mew/plugins/sdk/api"
	"mew/plugins/sdk/api/attachment"
	"mew/plugins/sdk/x/llm"
)

const (
	jpdictCardMessageType          = "app/x-jpdict-card"
	jpdictSystemPromptFilename     = "prompt/prompt.txt"
	jpdictDefaultTextPrompt        = "请帮我查询/翻译这段内容。"
	jpdictDefaultImagePrompt       = "请识别图片中的文字，并给出释义与翻译（如适用）。"
	jpdictEmptyInputErrorReplyText = "请输入有效的学习内容。"
	jpdictRequestFailedPrefix      = "请求失败："
)

type outboundMessage struct {
	Type    string
	Content string
	Payload map[string]any
}

func loadJpdictSystemPrompt() (string, error) {
	s, err := readPromptWithFallbacks([]string{jpdictSystemPromptFilename, "prompt.txt"}, "prompt.txt")
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(s) == "" {
		return "", fmt.Errorf("%s is empty", jpdictSystemPromptFilename)
	}
	return strings.TrimSpace(s), nil
}

func (r *JpdictRunner) handleQuery(ctx context.Context, input string, attachments []sdkapi.AttachmentRef) (outboundMessage, bool, error) {
	text := strings.TrimSpace(input)
	if text == "" && len(attachments) == 0 {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: jpdictEmptyInputErrorReplyText,
			Payload: map[string]any{"content": jpdictEmptyInputErrorReplyText},
		}, true, nil
	}

	reply, err := r.queryLLM(ctx, text, attachments)
	if err != nil {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: jpdictRequestFailedPrefix + err.Error(),
			Payload: map[string]any{"content": jpdictRequestFailedPrefix + err.Error()},
		}, true, nil
	}

	return outboundMessage{
		Type:    jpdictCardMessageType,
		Content: reply,
		Payload: map[string]any{"content": reply},
	}, true, nil
}

func (r *JpdictRunner) queryLLM(ctx context.Context, text string, attachments []sdkapi.AttachmentRef) (string, error) {
	r.cfgMu.RLock()
	cfg := r.cfg
	r.cfgMu.RUnlock()

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	apiKey := strings.TrimSpace(cfg.APIKey)
	model := strings.TrimSpace(cfg.Model)
	if baseURL == "" {
		baseURL = llm.DefaultOpenAIBaseURL
	}
	if model == "" {
		model = llm.DefaultOpenAIModel
	}
	if apiKey == "" {
		return "", fmt.Errorf("jpdict-agent config incomplete: api_key is required")
	}

	userMsg, err := llm.BuildUserMessageParam(ctx, "", "", time.Time{}, strings.TrimSpace(text), attachments, llm.BuildUserContentOptions{
		DefaultTextPrompt:  jpdictDefaultTextPrompt,
		DefaultImagePrompt: jpdictDefaultImagePrompt,
		Download: func(ctx context.Context, att sdkapi.AttachmentRef, limit int64) ([]byte, error) {
			// Use SDK-managed auth (refresh/login) via the MEW HTTP client's cookie jar + auth transport.
			return attachment.DownloadAttachmentBytes(ctx, r.session.HTTPClient(), r.llmHTTPClient, r.apiBase, "", att, limit)
		},
	})
	if err != nil {
		return "", err
	}

	resp, err := llm.CallOpenAIChatCompletionWithRetry(ctx, r.llmHTTPClient, llm.OpenAIChatConfig{
		BaseURL:        baseURL,
		APIKey:         apiKey,
		Model:          model,
		MaxRetries:     1, // avoid double-retry: we retry at this wrapper level
		RequestTimeout: 75 * time.Second,
	}, []openaigo.ChatCompletionMessageParamUnion{
		openaigo.SystemMessage(r.systemPrompt),
		userMsg,
	}, nil, llm.CallOpenAIChatCompletionWithRetryOptions{
		LogPrefix: "[jpdict-agent]",
	})
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", fmt.Errorf("llm returned empty choices")
	}

	out := strings.TrimSpace(resp.Choices[0].Message.Content)
	if out == "" {
		b, _ := json.Marshal(resp.Choices[0].Message.ToolCalls)
		return "", fmt.Errorf("llm returned empty content (tool_calls=%s)", strings.TrimSpace(string(b)))
	}
	return out, nil
}
