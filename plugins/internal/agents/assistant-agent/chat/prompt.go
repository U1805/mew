package chat

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/pkg"
	sdkapi "mew/plugins/pkg/api"
	"mew/plugins/pkg/x/llm"
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
	s, err := infra.ReadFile(embeddedName)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(s), nil
}

func FormatFactsForContext(f memory.FactsFile) string {
	if len(f.Facts) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for _, fact := range f.Facts {
		id := strings.TrimSpace(fact.FactID)
		content := strings.TrimSpace(fact.Content)
		if id == "" || content == "" {
			continue
		}
		b.WriteString(id)
		b.WriteString(": ")
		b.WriteString(content)
		b.WriteString("\n")
	}
	s := strings.TrimSpace(b.String())
	if s == "" {
		return "(none)"
	}
	return s
}

func FormatSummariesForContext(s memory.SummariesFile) string {
	if len(s.Summaries) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for _, item := range s.Summaries {
		id := strings.TrimSpace(item.SummaryID)
		sum := strings.TrimSpace(item.Summary)
		if id == "" || sum == "" {
			continue
		}
		b.WriteString(id)
		b.WriteString(": ")
		b.WriteString(sum)
		if rid := strings.TrimSpace(item.RecordID); rid != "" {
			b.WriteString(" (RecordID=")
			b.WriteString(rid)
			b.WriteString(")")
		}
		b.WriteString("\n")
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "(none)"
	}
	return out
}

func FormatUserActivityFrequency(activeDays, windowDays int) string {
	if windowDays <= 0 {
		windowDays = 7
	}
	if activeDays < 0 {
		activeDays = 0
	}
	dayWord := "days"
	if activeDays == 1 {
		dayWord = "day"
	}
	return fmt.Sprintf("Active %d %s in the last %d", activeDays, dayWord, windowDays)
}

func sanitizeMetaAttrValue(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\t", " ")
	s = strings.ReplaceAll(s, "\"", "'")
	s = strings.ReplaceAll(s, "<", "(")
	s = strings.ReplaceAll(s, ">", ")")
	s = strings.TrimSpace(s)
	if len(s) > 80 {
		s = s[:80]
		s = strings.TrimSpace(s)
	}
	return s
}

func timeInLocation(t time.Time, loc *time.Location) time.Time {
	if loc != nil && !t.IsZero() {
		return t.In(loc)
	}
	return t
}

func SpeakerMetaLine(loc *time.Location, username, userID string, sentAt time.Time) string {
	sentAt = timeInLocation(sentAt, loc)

	u := sanitizeMetaAttrValue(username)
	id := sanitizeMetaAttrValue(userID)
	if u == "" {
		u = "unknown"
	}
	if id == "" {
		id = "unknown"
	}
	if !sentAt.IsZero() {
		// HH:MM precision only, no seconds.
		return fmt.Sprintf(`<mew_speaker username="%s" user_id="%s" time="%s"/>`, u, id, sentAt.Format("15:04"))
	}
	return fmt.Sprintf(`<mew_speaker username="%s" user_id="%s"/>`, u, id)
}

func WrapUserTextWithSpeakerMeta(loc *time.Location, username, userID string, sentAt time.Time, text string) string {
	text = strings.TrimSpace(text)
	meta := SpeakerMetaLine(loc, username, userID, sentAt)
	if text == "" {
		return meta
	}
	return meta + "\n" + text
}

func SpeakerMetaFuncInLocation(loc *time.Location) llm.SpeakerMetaFunc {
	return func(username, userID string, sentAt time.Time) string {
		return SpeakerMetaLine(loc, username, userID, sentAt)
	}
}

var developerInstructionsOnce sync.Once
var developerInstructionsTemplate string

func DeveloperInstructionsText(
	silenceToken string,
	wantMoreToken string,
	proactiveTokenPrefix string,
	toolCallTokenPrefix string,
	stickerTokenPrefix string,
	availableStickerNames string,
	relPath string,
	embeddedName string,
) string {
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
	out := developerInstructionsTemplate
	out = strings.ReplaceAll(out, "{{SILENCE_TOKEN}}", silenceToken)
	out = strings.ReplaceAll(out, "{{WANT_MORE_TOKEN}}", wantMoreToken)
	out = strings.ReplaceAll(out, "{{PROACTIVE_TOKEN_PREFIX}}", proactiveTokenPrefix)
	out = strings.ReplaceAll(out, "{{TOOL_CALL_TOKEN_PREFIX}}", toolCallTokenPrefix)
	out = strings.ReplaceAll(out, "{{STICKER_TOKEN_PREFIX}}", stickerTokenPrefix)
	out = strings.ReplaceAll(out, "{{AVAILABLE_STICKER_NAMES}}", strings.TrimSpace(availableStickerNames))
	return out
}

func formatSessionStartDatetime(meta memory.Metadata, loc *time.Location) string {
	if !meta.StartAt.IsZero() {
		t := meta.StartAt
		if loc != nil {
			t = t.In(loc)
		}
		// Include weekday for better temporal grounding.
		return t.Format("2006-01-02 Mon 15:04")
	}
	return strings.TrimSpace(meta.SessionStartDatetime)
}

func BuildL1L4UserPrompt(developerInstructions string, meta memory.Metadata, facts memory.FactsFile, summaries memory.SummariesFile, loc *time.Location) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(developerInstructions))
	b.WriteString("\n\n")

	b.WriteString("### L2 Session Metadata\n")
	b.WriteString(fmt.Sprintf("session_start_datetime: %s\n", formatSessionStartDatetime(meta, loc)))
	b.WriteString(fmt.Sprintf("time_since_last_message: %s\n", strings.TrimSpace(meta.TimeSinceLastMessage)))
	b.WriteString(fmt.Sprintf("user_activity_frequency: %s\n", strings.TrimSpace(meta.UserActivityFrequency)))
	b.WriteString(fmt.Sprintf("initial_mood: {\"valence\": %.4f, \"arousal\": %.4f}\n", meta.InitialMood.Valence, meta.InitialMood.Arousal))
	b.WriteString("\n")

	b.WriteString("### L3 User Memory (Facts)\n")
	b.WriteString(FormatFactsForContext(facts))
	b.WriteString("\n\n")

	b.WriteString("### L4 Recent Summaries\n")
	b.WriteString(FormatSummariesForContext(summaries))
	b.WriteString("\n\n")

	return strings.TrimSpace(b.String())
}

func BuildL5Messages(sessionMsgs []sdkapi.ChannelMessage, botUserID string, loc *time.Location) []openaigo.ChatCompletionMessageParamUnion {
	out := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(sessionMsgs))
	var pendingAssistant string
	var hasPendingAssistant bool
	flushAssistant := func() {
		if !hasPendingAssistant {
			return
		}
		out = append(out, openaigo.AssistantMessage(pendingAssistant))
		pendingAssistant = ""
		hasPendingAssistant = false
	}
	for _, m := range sessionMsgs {
		content := strings.TrimSpace(m.ContextText())
		if content == "" {
			continue
		}

		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(botUserID) {
			role = "assistant"
		}

		if role == "assistant" {
			if hasPendingAssistant {
				pendingAssistant += "\n" + content
				continue
			}
			pendingAssistant = content
			hasPendingAssistant = true
			continue
		}

		flushAssistant()

		out = append(out, openaigo.UserMessage(WrapUserTextWithSpeakerMeta(loc, m.AuthorUsername(), m.AuthorID(), m.CreatedAt, content)))
	}
	flushAssistant()
	return out
}

func FormatSessionRecordForContext(msgs []sdkapi.ChannelMessage, loc *time.Location) string {
	if len(msgs) == 0 {
		return "(empty)"
	}
	var b strings.Builder
	for _, m := range msgs {
		ts := ""
		if !m.CreatedAt.IsZero() {
			t := m.CreatedAt
			if loc != nil {
				t = t.In(loc)
			}
			ts = t.Format(time.RFC3339)
		}
		author := m.AuthorUsername()
		if author == "" {
			author = m.AuthorID()
		}
		if author == "" {
			author = "unknown"
		}
		line := fmt.Sprintf("[%s] %s %s: %s", strings.TrimSpace(m.ID), ts, author, strings.TrimSpace(m.ContextText()))
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
	Download              llm.DownloadFunc
	Location              *time.Location
}

func BuildL5MessagesWithAttachments(ctx context.Context, sessionMsgs []sdkapi.ChannelMessage, botUserID string, opts UserContentPartsOptions) ([]openaigo.ChatCompletionMessageParamUnion, error) {
	out := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(sessionMsgs))
	var pendingAssistant string
	var hasPendingAssistant bool
	flushAssistant := func() {
		if !hasPendingAssistant {
			return
		}
		out = append(out, openaigo.AssistantMessage(pendingAssistant))
		pendingAssistant = ""
		hasPendingAssistant = false
	}
	for _, m := range sessionMsgs {
		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(botUserID) {
			role = "assistant"
		}

		if role == "user" {
			flushAssistant()

			attachments := make([]sdkapi.AttachmentRef, 0, len(m.Attachments)+1)
			attachments = append(attachments, m.Attachments...)
			attachments = append(attachments, llm.StickerAttachmentsFromPayload(m.ChannelID, m.Payload)...)

			userMsg, err := llm.BuildUserMessageParam(ctx, m.AuthorUsername(), m.AuthorID(), m.CreatedAt, strings.TrimSpace(m.ContextText()), attachments, llm.BuildUserContentOptions{
				DefaultImagePrompt:    opts.DefaultImagePrompt,
				MaxImageBytes:         opts.MaxImageBytes,
				MaxTotalImageBytes:    opts.MaxTotalImageBytes,
				KeepEmptyWhenNoImages: opts.KeepEmptyWhenNoImages,
				Download:              opts.Download,
				SpeakerMeta:           SpeakerMetaFuncInLocation(opts.Location),
			})
			if err != nil {
				return nil, err
			}
			out = append(out, userMsg)
			continue
		}

		content := strings.TrimSpace(m.ContextText())
		if content == "" {
			continue
		}
		if hasPendingAssistant {
			pendingAssistant += "\n" + content
			continue
		}
		pendingAssistant = content
		hasPendingAssistant = true
	}
	flushAssistant()
	return out, nil
}
