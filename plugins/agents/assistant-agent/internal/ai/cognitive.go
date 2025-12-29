package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/assistant-agent/internal/store"
)

type FactEngineResult struct {
	Facts       []string `json:"facts"`
	UsedFactIDs []string `json:"used_fact_ids"`
}

func ExtractFactsAndUsage(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, sessionText string, existing store.FactsFile) (FactEngineResult, error) {
	system := `You are a fact extraction engine.
Extract stable, user-specific facts from the conversation.
Write each fact in the user's language (use the predominant language of the conversation).
Do not translate facts into English unless the user is speaking English.
Also identify which existing facts were mentioned or strongly implied (semantic match is allowed).`
	user := "Conversation:\n" + sessionText + "\n\nExisting facts (ID: content):\n" + store.FormatFactsForContext(existing) + "\n\nReturn ONLY a JSON object like:\n{\"facts\": [\"...\"], \"used_fact_ids\": [\"F01\", \"F02\"]}\n"

	resp, err := CallChatCompletion(ctx, httpClient, cfg, []openaigo.ChatCompletionMessageParamUnion{
		openaigo.SystemMessage(system),
		openaigo.UserMessage(user),
	}, nil)
	if err != nil {
		return FactEngineResult{}, err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return FactEngineResult{}, fmt.Errorf("llm returned empty choices")
	}

	raw := extractJSONFromText(resp.Choices[0].Message.Content)
	var parsed FactEngineResult
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// Backward compat: allow a plain array output.
		var arr []string
		if err2 := json.Unmarshal([]byte(raw), &arr); err2 != nil {
			return FactEngineResult{}, fmt.Errorf("fact engine invalid json: %w (raw=%s)", err, raw)
		}
		parsed.Facts = arr
	}

	cleanFacts := make([]string, 0, len(parsed.Facts))
	for _, s := range parsed.Facts {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		cleanFacts = append(cleanFacts, t)
	}

	cleanIDs := make([]string, 0, len(parsed.UsedFactIDs))
	for _, id := range parsed.UsedFactIDs {
		t := strings.TrimSpace(id)
		if t == "" {
			continue
		}
		cleanIDs = append(cleanIDs, t)
	}

	return FactEngineResult{Facts: cleanFacts, UsedFactIDs: cleanIDs}, nil
}

func extractJSONFromText(s string) string {
	raw := strings.TrimSpace(s)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "```") {
		rest := strings.TrimSpace(strings.TrimPrefix(raw, "```"))
		if i := strings.Index(rest, "\n"); i >= 0 {
			rest = rest[i+1:]
		}
		if j := strings.LastIndex(rest, "```"); j >= 0 {
			rest = rest[:j]
		}
		raw = strings.TrimSpace(rest)
	}
	if !(strings.HasPrefix(raw, "{") || strings.HasPrefix(raw, "[")) {
		if i := strings.Index(raw, "{"); i >= 0 {
			if j := strings.LastIndex(raw, "}"); j > i {
				return strings.TrimSpace(raw[i : j+1])
			}
		}
		if i := strings.Index(raw, "["); i >= 0 {
			if j := strings.LastIndex(raw, "]"); j > i {
				return strings.TrimSpace(raw[i : j+1])
			}
		}
	}
	return strings.TrimSpace(raw)
}

func SummarizeRecord(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, recordText string) (string, error) {
	system := `You are a conversation summarizer.
Summarize the session record into 1-3 sentences, focusing on user intent, key events, and emotional tone.
Return plain text only.`
	user := "Session Record:\n" + recordText

	resp, err := CallChatCompletion(ctx, httpClient, cfg, []openaigo.ChatCompletionMessageParamUnion{
		openaigo.SystemMessage(system),
		openaigo.UserMessage(user),
	}, nil)
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", fmt.Errorf("llm returned empty choices")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}
