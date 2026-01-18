package proactive

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/chat"
	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/pkg"
	"mew/plugins/pkg/x/llm"
)

func BuildProactiveRequest(now time.Time, channelID string, recordID string, d *chat.ProactiveDirective) (ProactiveRequest, bool) {
	if d == nil {
		return ProactiveRequest{}, false
	}
	if strings.TrimSpace(channelID) == "" || strings.TrimSpace(recordID) == "" {
		return ProactiveRequest{}, false
	}

	delay := time.Duration(d.DelaySeconds)*time.Second + time.Duration(d.DelayMinutes)*time.Minute
	if delay <= 0 {
		delay = 3 * time.Minute
	}
	if delay < 30*time.Second {
		delay = 30 * time.Second
	}
	if delay > 24*time.Hour {
		delay = 24 * time.Hour
	}

	return ProactiveRequest{
		AddedAt:   now,
		RequestAt: now.Add(delay),
		Reason:    strings.TrimSpace(d.Reason),
		ChannelID: strings.TrimSpace(channelID),
		RecordID:  strings.TrimSpace(recordID),
	}, true
}

func RunProactiveQueueForUser(
	c infra.AssistantRequestContext,
	q ProactiveQueueFile,
	meta memory.Metadata,
	summaries memory.SummariesFile,
) ProactiveQueueFile {
	ctx := infra.ContextOrBackground(c.Ctx)
	userID := strings.TrimSpace(c.UserID)
	logPrefix := strings.TrimSpace(c.LogPrefix)
	timeLoc := c.TimeLoc
	fetcher := c.History.Fetcher

	if fetcher == nil {
		return q
	}
	if len(q.Requests) == 0 {
		return q
	}

	now := time.Now()
	hasDue := false
	for _, req := range q.Requests {
		if !req.RequestAt.After(now) {
			hasDue = true
			break
		}
	}
	if !hasDue {
		return q
	}

	var currentSessionStartAt time.Time
	var currentChannelID, currentRecordID, currentRecordText string
	if strings.TrimSpace(meta.ChannelID) != "" {
		if msgs, rid, startAt, err := fetcher.FetchSessionMessages(ctx, meta.ChannelID); err == nil && len(msgs) > 0 {
			currentChannelID = meta.ChannelID
			currentRecordID = rid
			currentSessionStartAt = startAt
			currentRecordText = chat.FormatSessionRecordForContext(msgs, timeLoc)
		}
	}

	kept := make([]ProactiveRequest, 0, len(q.Requests))
	for _, req := range q.Requests {
		if req.RequestAt.After(now) {
			kept = append(kept, req)
			continue
		}

		if req.Attempts >= 3 {
			continue
		}
		if !req.LastAttemptAt.IsZero() && now.Sub(req.LastAttemptAt) < 60*time.Second {
			kept = append(kept, req)
			continue
		}
		req.Attempts++
		req.LastAttemptAt = now

		msgs, err := fetcher.RecordSearch(ctx, req.ChannelID, req.RecordID)
		if err != nil {
			log.Printf("%s proactive record load failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
			kept = append(kept, req)
			continue
		}
		recordText := chat.FormatSessionRecordForContext(msgs, timeLoc)

		intermediate := formatSummariesBetween(summaries, req.AddedAt, currentSessionStartAt, now, 12, timeLoc)
		out, err := proactiveDecideAndCompose(c.LLM, c.Persona, req, recordText, currentChannelID, currentRecordID, currentRecordText, intermediate, logPrefix, timeLoc)
		if err != nil {
			log.Printf("%s proactive llm failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
			kept = append(kept, req)
			continue
		}

		outClean, _ := chat.ParseReplyControls(out)
		outClean = strings.TrimSpace(outClean)
		if outClean == "" || strings.TrimSpace(outClean) == infra.AssistantSilenceToken || strings.Contains(outClean, infra.AssistantSilenceToken) {
			continue
		}

		if err := sendReplyHTTP(ctx, req.ChannelID, outClean, infra.AssistantTypingWPMDefault, func(line string) error {
			return chat.PostMessageHTTP(c.Mew.WithCtx(ctx), req.ChannelID, line)
		}); err != nil {
			log.Printf("%s proactive send failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
			kept = append(kept, req)
			continue
		}
		log.Printf("%s proactive sent: channel=%s record=%s reason=%q preview=%q",
			logPrefix,
			req.ChannelID,
			req.RecordID,
			sdk.PreviewString(req.Reason, infra.AssistantLogContentPreviewLen),
			sdk.PreviewString(outClean, infra.AssistantLogContentPreviewLen),
		)
	}

	q.Requests = kept
	return q
}

func proactiveDecideAndCompose(
	c infra.LLMCallContext,
	persona string,
	req ProactiveRequest,
	recordText string,
	currentChannelID string,
	currentRecordID string,
	currentRecordText string,
	intermediateSummaries string,
	logPrefix string,
	timeLoc *time.Location,
) (string, error) {
	ctx := infra.ContextOrBackground(c.Ctx)

	system := strings.TrimSpace(persona)
	if system == "" {
		system = "You are a helpful assistant."
	}

	now := time.Now()
	nowLocal := now
	if timeLoc != nil && !nowLocal.IsZero() {
		nowLocal = nowLocal.In(timeLoc)
	}
	addedAtLocal := req.AddedAt
	if timeLoc != nil && !addedAtLocal.IsZero() {
		addedAtLocal = addedAtLocal.In(timeLoc)
	}
	requestAtLocal := req.RequestAt
	if timeLoc != nil && !requestAtLocal.IsZero() {
		requestAtLocal = requestAtLocal.In(timeLoc)
	}
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
		infra.AssistantSilenceToken,
		infra.AssistantWantMoreToken,
		infra.AssistantProactiveTokenPrefix,
		nowLocal.Format(time.RFC3339),
		addedAtLocal.Format(time.RFC3339),
		requestAtLocal.Format(time.RFC3339),
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

	openaiCfg, err := c.Config.OpenAIChatConfig()
	if err != nil {
		return "", err
	}
	resp, err := llm.CallOpenAIChatCompletionWithRetry(ctx, c.HTTPClient, openaiCfg, messages, nil, llm.CallOpenAIChatCompletionWithRetryOptions{
		MaxRetries:     infra.AssistantMaxLLMRetries,
		InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
		LogPrefix:      infra.AssistantLogPrefix,
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
		sdk.PreviewString(out, infra.AssistantLogLLMPreviewLen),
	)
	return out, nil
}

func formatSummariesBetween(s memory.SummariesFile, start time.Time, end time.Time, fallbackEnd time.Time, max int, timeLoc *time.Location) string {
	if len(s.Summaries) == 0 {
		return ""
	}
	if end.IsZero() {
		end = fallbackEnd
	}
	if end.IsZero() {
		return ""
	}
	if max <= 0 {
		max = 12
	}

	items := make([]memory.Summary, 0, len(s.Summaries))
	for _, it := range s.Summaries {
		if it.CreatedAt.IsZero() {
			continue
		}
		if !start.IsZero() && it.CreatedAt.Before(start) {
			continue
		}
		if it.CreatedAt.After(end) {
			continue
		}
		if strings.TrimSpace(it.Summary) == "" {
			continue
		}
		items = append(items, it)
	}
	if len(items) == 0 {
		return ""
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	if len(items) > max {
		items = items[len(items)-max:]
	}

	var b strings.Builder
	for _, it := range items {
		id := strings.TrimSpace(it.SummaryID)
		if id == "" {
			id = "S??"
		}
		rid := strings.TrimSpace(it.RecordID)
		if rid == "" {
			rid = "unknown"
		}

		createdAtLocal := it.CreatedAt
		if timeLoc != nil && !createdAtLocal.IsZero() {
			createdAtLocal = createdAtLocal.In(timeLoc)
		}
		b.WriteString(fmt.Sprintf("%s [%s] (RecordID=%s): %s\n",
			id,
			createdAtLocal.Format(time.RFC3339),
			rid,
			strings.TrimSpace(it.Summary),
		))
	}
	return strings.TrimSpace(b.String())
}

func sendReplyHTTP(ctx context.Context, channelID string, reply string, typingWPM int, postLine func(line string) error) error {
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return nil
	}
	if strings.TrimSpace(channelID) == "" {
		return nil
	}

	lines := make([]string, 0, infra.AssistantMaxReplyLines)
	for _, line := range strings.Split(reply, "\n") {
		if len(lines) >= infra.AssistantMaxReplyLines {
			break
		}
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		lines = append(lines, t)
	}

	for i, t := range lines {
		chat.SleepWithContext(ctx, chat.AssistantTypingDelayForLine(t, typingWPM))
		if err := postLine(t); err != nil {
			return err
		}
		if i < len(lines)-1 {
			chat.SleepWithContext(ctx, chat.AssistantReplyDelayForLine(t))
		}
	}
	return nil
}
