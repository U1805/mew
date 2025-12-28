package ai

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/assistant-agent/prompt"
	"mew/plugins/sdk"
	"mew/plugins/sdk/mew"
)

func ReadPromptWithOverrides(relPath, embeddedName string) (string, error) {
	paths := sdk.CandidateDataFilePaths(relPath)
	for _, path := range paths {
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		s := strings.TrimSpace(string(b))
		if s == "" {
			continue
		}
		return s, nil
	}
	s, err := prompt.ReadFile(embeddedName)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(s), nil
}

var developerInstructionsOnce sync.Once
var developerInstructionsTemplate string

func DeveloperInstructionsText(silenceToken, relPath, embeddedName string) string {
	developerInstructionsOnce.Do(func() {
		s, err := ReadPromptWithOverrides(relPath, embeddedName)
		if err != nil {
			developerInstructionsTemplate = ""
			return
		}
		developerInstructionsTemplate = strings.TrimSpace(s)
	})
	if developerInstructionsTemplate == "" {
		return ""
	}
	return strings.ReplaceAll(developerInstructionsTemplate, "{{SILENCE_TOKEN}}", silenceToken)
}

func BuildL1L4UserPrompt(developerInstructions string, meta store.Metadata, facts store.FactsFile, summaries store.SummariesFile) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(developerInstructions))
	b.WriteString("\n\n")

	b.WriteString("### L2 Session Metadata\n")
	b.WriteString(fmt.Sprintf("session_start_datetime: %s\n", strings.TrimSpace(meta.SessionStartDatetime)))
	b.WriteString(fmt.Sprintf("time_since_last_message: %s\n", strings.TrimSpace(meta.TimeSinceLastMessage)))
	b.WriteString(fmt.Sprintf("user_activity_frequency: %s\n", strings.TrimSpace(meta.UserActivityFrequency)))
	b.WriteString(fmt.Sprintf("initial_mood: {\"valence\": %.4f, \"arousal\": %.4f}\n", meta.InitialMood.Valence, meta.InitialMood.Arousal))
	b.WriteString("\n")

	b.WriteString("### L3 User Memory (Facts)\n")
	b.WriteString(store.FormatFactsForContext(facts))
	b.WriteString("\n\n")

	b.WriteString("### L4 Recent Summaries\n")
	b.WriteString(store.FormatSummariesForContext(summaries))
	b.WriteString("\n\n")

	return strings.TrimSpace(b.String())
}

func BuildL5Messages(sessionMsgs []mew.ChannelMessage, botUserID string) []openaigo.ChatCompletionMessageParamUnion {
	out := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(sessionMsgs))
	for _, m := range sessionMsgs {
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}

		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(botUserID) {
			role = "assistant"
		}

		if role == "assistant" {
			out = append(out, openaigo.AssistantMessage(content))
		} else {
			out = append(out, openaigo.UserMessage(content))
		}
	}
	return out
}

func FormatSessionRecordForContext(msgs []mew.ChannelMessage) string {
	if len(msgs) == 0 {
		return "(empty)"
	}
	var b strings.Builder
	for _, m := range msgs {
		ts := ""
		if !m.CreatedAt.IsZero() {
			ts = m.CreatedAt.Format(time.RFC3339)
		}
		author := m.AuthorUsername()
		if author == "" {
			author = m.AuthorID()
		}
		if author == "" {
			author = "unknown"
		}
		line := fmt.Sprintf("[%s] %s %s: %s", strings.TrimSpace(m.ID), ts, author, strings.TrimSpace(m.Content))
		b.WriteString(strings.TrimSpace(line))
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}

type UserContentPartsOptions struct {
	DefaultImagePrompt    string
	MaxImageBytes         int64
	MaxTotalImageBytes    int64
	KeepEmptyWhenNoImages bool
	Download              DownloadFunc
}

func BuildL5MessagesWithAttachments(ctx context.Context, sessionMsgs []mew.ChannelMessage, botUserID string, opts UserContentPartsOptions) ([]openaigo.ChatCompletionMessageParamUnion, error) {
	out := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(sessionMsgs))
	for _, m := range sessionMsgs {
		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(botUserID) {
			role = "assistant"
		}

		if role == "user" {
			userMsg, err := BuildUserMessageParam(ctx, strings.TrimSpace(m.Content), m.Attachments, BuildUserContentOptions{
				DefaultImagePrompt:    opts.DefaultImagePrompt,
				MaxImageBytes:         opts.MaxImageBytes,
				MaxTotalImageBytes:    opts.MaxTotalImageBytes,
				KeepEmptyWhenNoImages: opts.KeepEmptyWhenNoImages,
				Download:              opts.Download,
			})
			if err != nil {
				return nil, err
			}
			out = append(out, userMsg)
			continue
		}

		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		out = append(out, openaigo.AssistantMessage(content))
	}
	return out, nil
}
