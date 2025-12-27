package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"mew/plugins/sdk"
	"mew/plugins/sdk/mew"
	"mew/plugins/sdk/openai"
)

const (
	jpdictCardMessageType          = "app/x-jpdict-card"
	jpdictSystemPromptFilename     = "prompt.txt"
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
	paths := sdk.CandidateDataFilePaths(jpdictSystemPromptFilename)
	var lastErr error
	for _, path := range paths {
		b, err := os.ReadFile(path)
		if err != nil {
			lastErr = err
			continue
		}
		s := strings.TrimSpace(string(b))
		if s == "" {
			return "", fmt.Errorf("%s is empty", jpdictSystemPromptFilename)
		}
		return s, nil
	}
	if lastErr == nil {
		lastErr = os.ErrNotExist
	}
	return "", fmt.Errorf("read %s failed: %w (searched: %s)", jpdictSystemPromptFilename, lastErr, strings.Join(paths, ", "))
}

func (r *JpdictRunner) handleQuery(ctx context.Context, input string, attachments []socketAttachment) (outboundMessage, bool, error) {
	text := strings.TrimSpace(input)
	if text == "" && len(attachments) == 0 {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: "",
			Payload: map[string]any{"content": jpdictEmptyInputErrorReplyText},
		}, true, nil
	}

	reply, err := r.queryLLM(ctx, text, attachments)
	if err != nil {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: "",
			Payload: map[string]any{"content": jpdictRequestFailedPrefix + err.Error()},
		}, true, nil
	}

	return outboundMessage{
		Type:    jpdictCardMessageType,
		Content: "",
		Payload: map[string]any{"content": reply},
	}, true, nil
}

func (r *JpdictRunner) queryLLM(ctx context.Context, text string, attachments []socketAttachment) (string, error) {
	r.cfgMu.RLock()
	cfg := r.cfg
	r.cfgMu.RUnlock()

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	apiKey := strings.TrimSpace(cfg.APIKey)
	model := strings.TrimSpace(cfg.Model)
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	if apiKey == "" {
		return "", fmt.Errorf("jpdict-agent config incomplete: api_key is required")
	}

	parts, err := openai.BuildUserContentParts(ctx, strings.TrimSpace(text), attachments, openai.BuildUserContentOptions{
		DefaultTextPrompt:  jpdictDefaultTextPrompt,
		DefaultImagePrompt: jpdictDefaultImagePrompt,
		Download: func(ctx context.Context, att mew.AttachmentRef, limit int64) ([]byte, error) {
			return mew.DownloadAttachmentBytes(ctx, r.mewHTTPClient, r.llmHTTPClient, r.apiBase, r.userToken, att, limit)
		},
	})
	if err != nil {
		return "", err
	}

	reqBody := openai.ChatCompletionsRequest{
		Model: model,
		Messages: []openai.ChatMessage{
			{Role: "system", Content: r.systemPrompt},
			{Role: "user", Content: parts},
		},
	}
	return openai.ChatCompletions(ctx, r.llmHTTPClient, baseURL, apiKey, reqBody, openai.ChatOptions{})
}
