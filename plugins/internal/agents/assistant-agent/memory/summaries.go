package memory

import (
	"fmt"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/agentctx"
	"mew/plugins/internal/agents/assistant-agent/utils"
	"mew/plugins/pkg/x/llm"
)

type Summary struct {
	SummaryID string    `json:"summaryId"`
	RecordID  string    `json:"recordId"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"createdAt"`
}

type SummariesFile struct {
	Summaries []Summary `json:"summaries"`
}

func AppendSummary(now time.Time, summaries SummariesFile, recordID, summaryText string, maxSummaries int) SummariesFile {
	if summaries.Summaries == nil {
		summaries.Summaries = []Summary{}
	}
	summaryText = strings.TrimSpace(summaryText)
	recordID = strings.TrimSpace(recordID)
	if summaryText == "" || recordID == "" {
		return summaries
	}
	for _, s := range summaries.Summaries {
		if s.RecordID == recordID {
			return summaries
		}
	}
	summaries.Summaries = append(summaries.Summaries, Summary{
		SummaryID: utils.NextIDRandomHex4(utils.CollectIDs(summaries.Summaries, func(s Summary) string { return s.SummaryID }), 'S'),
		RecordID:  recordID,
		Summary:   summaryText,
		CreatedAt: now,
	})
	if maxSummaries > 0 && len(summaries.Summaries) > maxSummaries {
		summaries.Summaries = summaries.Summaries[len(summaries.Summaries)-maxSummaries:]
	}
	return summaries
}

func SummarizeRecord(c agentctx.LLMCallContext, recordText string, opts utils.CognitiveRetryOptions) (string, error) {
	ctx := agentctx.ContextOrBackground(c.Ctx)

	system := `You are a conversation summarizer.
Summarize the session record into 1-3 sentences, focusing on user intent, key events, and emotional tone.
Return plain text only.`
	user := "Session Record:\n" + recordText

	openaiCfg, err := c.Config.OpenAIChatConfig()
	if err != nil {
		return "", err
	}

	var out string
	err = utils.RetryCognitive(ctx, opts, func() error {
		resp, err := llm.CallOpenAIChatCompletion(ctx, c.HTTPClient, openaiCfg, []openaigo.ChatCompletionMessageParamUnion{
			openaigo.SystemMessage(system),
			openaigo.UserMessage(user),
		}, nil)
		if err != nil {
			return err
		}
		if resp == nil || len(resp.Choices) == 0 {
			return fmt.Errorf("llm returned empty choices")
		}
		out = strings.TrimSpace(resp.Choices[0].Message.Content)
		if out == "" {
			return fmt.Errorf("llm returned empty content")
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return out, nil
}
