package bot

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/agent/store"
	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk"
	"mew/plugins/sdk/util/llm"
)

func (r *Runner) proactiveDecideAndCompose(
	ctx context.Context,
	req store.ProactiveRequest,
	recordText string,
	currentChannelID string,
	currentRecordID string,
	currentRecordText string,
	intermediateSummaries string,
	logPrefix string,
) (string, error) {
	system := strings.TrimSpace(r.persona)
	if system == "" {
		system = "You are a helpful assistant."
	}

	now := time.Now()
	var currentIDs string
	{
		var b strings.Builder
		if strings.TrimSpace(currentChannelID) != "" {
			b.WriteString(fmt.Sprintf("- current_channel_id: %s\n", strings.TrimSpace(currentChannelID)))
		}
		if strings.TrimSpace(currentRecordID) != "" {
			b.WriteString(fmt.Sprintf("- current_record_id: %s\n", strings.TrimSpace(currentRecordID)))
		}
		currentIDs = strings.TrimSpace(b.String())
	}
	intermediateSummaries = strings.TrimSpace(intermediateSummaries)
	currentRecordText = strings.TrimSpace(currentRecordText)
	userPrompt := strings.TrimSpace(fmt.Sprintf(
		`You may send ONE proactive message to the user, or decide to send nothing.

Rules:
- If you decide to send nothing, output exactly %s and nothing else.
- If you decide to send, output only the message content (no %s / %s directives, no final_mood line).
- Avoid repeating what was already discussed; do not interrupt if the user already continued the topic.
===

Scheduling context:
- now: %s
- added_at: %s
- request_at: %s
- reason: %s
- record_id: %s

Current conversation context (may differ from this scheduled request):
%s
===

Scheduled session record (when the request was created):
%s

Session summaries between the scheduled request and now:
%s

Recent current session record:
%s
`,
		config.AssistantSilenceToken,
		config.AssistantWantMoreToken,
		config.AssistantProactiveTokenPrefix,
		now.Format(time.RFC3339),
		req.AddedAt.Format(time.RFC3339),
		req.RequestAt.Format(time.RFC3339),
		strings.TrimSpace(req.Reason),
		strings.TrimSpace(req.RecordID),
		currentIDs,
		strings.TrimSpace(recordText),
		intermediateSummaries,
		currentRecordText,
	))

	messages := []openaigo.ChatCompletionMessageParamUnion{
		openaigo.SystemMessage(system),
		openaigo.UserMessage(userPrompt),
	}

	openaiCfg, err := r.aiConfig.OpenAIChatConfig()
	if err != nil {
		return "", err
	}
	resp, err := llm.CallOpenAIChatCompletionWithRetry(ctx, r.llmHTTPClient, openaiCfg, messages, nil, llm.CallOpenAIChatCompletionWithRetryOptions{
		MaxRetries:     config.AssistantMaxLLMRetries,
		InitialBackoff: config.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
		LogPrefix:      config.AssistantLogPrefix,
		ChannelID:      req.ChannelID,
	})
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", fmt.Errorf("llm returned empty choices")
	}
	out := strings.TrimSpace(resp.Choices[0].Message.Content)
	log.Printf("%s proactive llm output preview: channel=%s record=%s %q",
		logPrefix,
		req.ChannelID,
		req.RecordID,
		sdk.PreviewString(out, config.AssistantLogLLMPreviewLen),
	)
	return out, nil
}
