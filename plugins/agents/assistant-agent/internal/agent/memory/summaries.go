package memory

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk/x/llm"
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

func NextSummaryID(summaries []Summary) string {
	maxN := 0
	for _, summary := range summaries {
		id := strings.TrimSpace(summary.SummaryID)
		if len(id) != 3 || (id[0] != 'S' && id[0] != 's') {
			continue
		}
		n := int(id[1]-'0')*10 + int(id[2]-'0')
		if n > maxN {
			maxN = n
		}
	}
	n := maxN + 1
	if n > 99 {
		n = 99
	}
	return "S" + twoDigits(n)
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
		SummaryID: NextSummaryID(summaries.Summaries),
		RecordID:  recordID,
		Summary:   summaryText,
		CreatedAt: now,
	})
	if maxSummaries > 0 && len(summaries.Summaries) > maxSummaries {
		summaries.Summaries = summaries.Summaries[len(summaries.Summaries)-maxSummaries:]
	}
	return summaries
}

func SummarizeRecord(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, recordText string) (string, error) {
	return SummarizeRecordWithRetry(ctx, httpClient, cfg, recordText, CognitiveRetryOptions{})
}

func SummarizeRecordWithRetry(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, recordText string, opts CognitiveRetryOptions) (string, error) {
	system := `You are a conversation summarizer.
Summarize the session record into 1-3 sentences, focusing on user intent, key events, and emotional tone.
Return plain text only.`
	user := "Session Record:\n" + recordText

	openaiCfg, err := cfg.OpenAIChatConfig()
	if err != nil {
		return "", err
	}

	var out string
	err = retryCognitive(ctx, opts, func() error {
		resp, err := llm.CallOpenAIChatCompletion(ctx, httpClient, openaiCfg, []openaigo.ChatCompletionMessageParamUnion{
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
