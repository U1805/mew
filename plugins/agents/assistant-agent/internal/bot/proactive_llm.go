package bot

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/ai"
	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
)

func (r *Runner) proactiveDecideAndCompose(
	ctx context.Context,
	req store.ProactiveRequest,
	recordText string,
	logPrefix string,
) (string, error) {
	system := strings.TrimSpace(r.persona)
	if system == "" {
		system = "You are a helpful assistant."
	}

	now := time.Now()
	userPrompt := strings.TrimSpace(fmt.Sprintf(
		`You may send ONE proactive message to the user, or decide to send nothing.

Rules:
- If you decide to send nothing, output exactly %s and nothing else.
- If you decide to send, output only the message content (no %s / %s directives, no final_mood line).
- Avoid repeating what was already discussed; do not interrupt if the user already continued the topic.

Scheduling context:
- now: %s
- added_at: %s
- request_at: %s
- reason: %s
- record_id: %s

Recent session record:
%s
`,
		assistantSilenceToken,
		assistantWantMoreToken,
		assistantProactiveTokenPrefix,
		now.Format(time.RFC3339),
		req.AddedAt.Format(time.RFC3339),
		req.RequestAt.Format(time.RFC3339),
		strings.TrimSpace(req.Reason),
		strings.TrimSpace(req.RecordID),
		strings.TrimSpace(recordText),
	))

	messages := []openaigo.ChatCompletionMessageParamUnion{
		openaigo.SystemMessage(system),
		openaigo.UserMessage(userPrompt),
	}

	resp, err := ai.CallChatCompletionWithRetry(ctx, r.llmHTTPClient, r.aiConfig, messages, nil, ai.CallChatCompletionWithRetryOptions{
		MaxRetries:     assistantMaxLLMRetries,
		InitialBackoff: assistantLLMRetryInitialBackoff,
		MaxBackoff:     assistantLLMRetryMaxBackoff,
		LogPrefix:      assistantLogPrefix,
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
		sdk.PreviewString(out, assistantLogLLMPreviewLen),
	)
	return out, nil
}
