package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"mew/plugins/sdk"
	"mew/plugins/sdk/mew"
	"mew/plugins/sdk/openai"
	"mew/plugins/sdk/socketio"
)

type chatMessage = openai.ChatMessage
type mewMessage = mew.ChannelMessage
type mewAttachment = mew.AttachmentRef

type Mood struct {
	Valence float64 `json:"valence"`
	Arousal float64 `json:"arousal"`
}

type Metadata struct {
	SessionStartDatetime  string `json:"session_start_datetime"`
	TimeSinceLastMessage  string `json:"time_since_last_message"`
	UserActivityFrequency string `json:"user_activity_frequency"`

	InitialMood  Mood `json:"initial_mood"`
	FinalMood    Mood `json:"final_mood"`
	BaselineMood Mood `json:"baseline_mood"`

	RecordID      string    `json:"recordId"`
	StartAt       time.Time `json:"startAt"`
	LastMessageAt time.Time `json:"lastMessageAt"`
	ChannelID     string    `json:"channelId"`

	LastSummarizedRecordID string `json:"lastSummarizedRecordId"`
}

type Fact struct {
	FactID         string    `json:"factId"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"createdAt"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

type FactsFile struct {
	Facts []Fact `json:"facts"`
}

type Summary struct {
	SummaryID string    `json:"summaryId"`
	RecordID  string    `json:"recordId"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"createdAt"`
}

type SummariesFile struct {
	Summaries []Summary `json:"summaries"`
}

const (
	assistantUsersDirName      = "users"
	assistantFactsFilename     = "facts.json"
	assistantSummariesFilename = "summaries.json"
	assistantMetadataFilename  = "metadata.json"

	assistantPersonaFilename               = "prompt/system_prompt.txt"
	assistantDeveloperInstructionsFilename = "prompt/instruct_prompt.txt"

	assistantEventMessageCreate    = "MESSAGE_CREATE"
	assistantUpstreamMessageCreate = "message/create"

	assistantSilenceToken = "<SILENCE>"

	toolHistorySearch = "HistorySearch"
	toolRecordSearch  = "RecordSearch"

	assistantMaxSessionMessages = 40
	assistantFetchPageSize      = 100
	assistantMaxFetchPages      = 20
	assistantMaxReplyLines      = 20
	assistantMaxToolCalls       = 3
	assistantMaxFacts           = 30
	assistantMaxSummaries       = 30

	assistantMaxImageBytes      = int64(5 * 1024 * 1024)
	assistantMaxTotalImageBytes = int64(12 * 1024 * 1024)

	assistantSessionGap = 10 * time.Minute

	assistantDefaultBaselineValence = 0.2
	assistantDefaultBaselineArousal = 0.1
	assistantMoodDecayKPerHour      = 0.25

	assistantDefaultLLMBaseURL      = "https://api.openai.com/v1"
	assistantDefaultLLMModel        = "gpt-4o-mini"
	assistantLLMChatCompletionsPath = "/chat/completions"
	assistantLLMMaxRetries          = 5
	assistantLLMRetryBaseDelay      = 500 * time.Millisecond
	assistantLLMRetryMaxDelay       = 8 * time.Second

	assistantDefaultImagePrompt = "请识别图片中的内容，并结合上下文回复。"

	assistantLogPrefix = "[assistant-agent]"

	assistantLogPersonaPreviewLen    = 100
	assistantLogContentPreviewLen    = 160
	assistantLogLLMPreviewLen        = 240
	assistantLogToolResultPreviewLen = 240

	assistantSessionStartTimeFormat = "2006-01-02 15:04"
	assistantDefaultActivity        = "Active recently"

	assistantDefaultMewURL = "http://localhost:3000"

	assistantTimeSincePrefix  = "~"
	assistantTimeSinceUnknown = "unknown"
)

func formatFactsForContext(f FactsFile) string {
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

func formatSummariesForContext(s SummariesFile) string {
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

func formatSessionRecordForContext(msgs []mewMessage) string {
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

func buildL1L4UserPrompt(meta Metadata, facts FactsFile, summaries SummariesFile) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(assistantDeveloperInstructionsText()))
	b.WriteString("\n\n")

	b.WriteString("### L2 Session Metadata\n")
	b.WriteString(fmt.Sprintf("session_start_datetime: %s\n", strings.TrimSpace(meta.SessionStartDatetime)))
	b.WriteString(fmt.Sprintf("time_since_last_message: %s\n", strings.TrimSpace(meta.TimeSinceLastMessage)))
	b.WriteString(fmt.Sprintf("user_activity_frequency: %s\n", strings.TrimSpace(meta.UserActivityFrequency)))
	b.WriteString(fmt.Sprintf("initial_mood: {\"valence\": %.4f, \"arousal\": %.4f}\n", meta.InitialMood.Valence, meta.InitialMood.Arousal))
	b.WriteString("\n")

	b.WriteString("### L3 User Memory (Facts)\n")
	b.WriteString(formatFactsForContext(facts))
	b.WriteString("\n\n")

	b.WriteString("### L4 Recent Summaries\n")
	b.WriteString(formatSummariesForContext(summaries))
	b.WriteString("\n\n")

	return strings.TrimSpace(b.String())
}

func buildL5Messages(sessionMsgs []mewMessage, botUserID string) []chatMessage {
	out := make([]chatMessage, 0, len(sessionMsgs))
	for _, m := range sessionMsgs {
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}

		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(botUserID) {
			role = "assistant"
		}

		out = append(out, chatMessage{Role: role, Content: content})
	}
	return out
}

func callChatCompletions(ctx context.Context, httpClient *http.Client, cfg AssistantConfig, messages []chatMessage) (string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = assistantDefaultLLMBaseURL
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = assistantDefaultLLMModel
	}

	return openai.ChatCompletions(ctx, httpClient, baseURL, cfg.APIKey, openai.ChatCompletionsRequest{
		Model:    model,
		Messages: messages,
	}, openai.ChatOptions{
		Path:        assistantLLMChatCompletionsPath,
		MaxRetries:  assistantLLMMaxRetries,
		BaseDelay:   assistantLLMRetryBaseDelay,
		MaxDelay:    assistantLLMRetryMaxDelay,
		HTTPTimeout: 75 * time.Second,
	})
}

func newLLMHTTPClient() *http.Client {
	return &http.Client{Timeout: 75 * time.Second}
}

func (r *AssistantRunner) buildUserContentParts(ctx context.Context, text string, attachments []mewAttachment) (any, error) {
	return openai.BuildUserContentParts(ctx, strings.TrimSpace(text), attachments, openai.BuildUserContentOptions{
		DefaultImagePrompt:    assistantDefaultImagePrompt,
		MaxImageBytes:         assistantMaxImageBytes,
		MaxTotalImageBytes:    assistantMaxTotalImageBytes,
		KeepEmptyWhenNoImages: true,
		Download: func(ctx context.Context, att mew.AttachmentRef, limit int64) ([]byte, error) {
			return mew.DownloadAttachmentBytes(ctx, r.mewHTTPClient, r.mewHTTPClient, r.apiBase, r.userToken, att, limit)
		},
	})
}

func (r *AssistantRunner) buildL5MessagesWithAttachments(ctx context.Context, sessionMsgs []mewMessage) ([]chatMessage, error) {
	out := make([]chatMessage, 0, len(sessionMsgs))
	for _, m := range sessionMsgs {
		role := "user"
		if strings.TrimSpace(m.AuthorID()) == strings.TrimSpace(r.botUserID) {
			role = "assistant"
		}

		if role == "user" {
			contentAny, err := r.buildUserContentParts(ctx, m.Content, m.Attachments)
			if err != nil {
				return nil, err
			}
			switch v := contentAny.(type) {
			case string:
				if strings.TrimSpace(v) == "" {
					continue
				}
			default:
			}
			out = append(out, chatMessage{Role: role, Content: contentAny})
			continue
		}

		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		out = append(out, chatMessage{Role: role, Content: content})
	}
	return out, nil
}

func (r *AssistantRunner) recordSearch(ctx context.Context, channelID, recordID string) ([]mewMessage, error) {
	recordID = strings.TrimSpace(recordID)
	if recordID == "" {
		return nil, fmt.Errorf("record_id is required")
	}
	var desc []mewMessage
	before := ""
	for page := 0; page < assistantMaxFetchPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, r.mewHTTPClient, r.apiBase, r.userToken, channelID, assistantFetchPageSize, before)
		if err != nil {
			return nil, err
		}
		if len(msgs) == 0 {
			break
		}
		desc = append(desc, msgs...)
		before = msgs[len(msgs)-1].ID

		chrono := append([]mewMessage(nil), desc...)
		mew.ReverseMessagesInPlace(chrono)
		sessions := mew.SplitSessionsChronological(chrono, assistantSessionGap)
		if s := mew.FindSessionByRecordID(sessions, recordID); len(s) > 0 {
			return s, nil
		}
	}
	return nil, fmt.Errorf("record not found (record_id=%s)", recordID)
}

func (r *AssistantRunner) recordIDForMessage(ctx context.Context, channelID, messageID string) (string, error) {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return "", fmt.Errorf("message_id is required")
	}
	var desc []mewMessage
	before := ""
	for page := 0; page < assistantMaxFetchPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, r.mewHTTPClient, r.apiBase, r.userToken, channelID, assistantFetchPageSize, before)
		if err != nil {
			return "", err
		}
		if len(msgs) == 0 {
			break
		}
		desc = append(desc, msgs...)
		before = msgs[len(msgs)-1].ID

		chrono := append([]mewMessage(nil), desc...)
		mew.ReverseMessagesInPlace(chrono)
		sessions := mew.SplitSessionsChronological(chrono, assistantSessionGap)
		for _, s := range sessions {
			for _, m := range s {
				if m.ID == messageID {
					if len(s) > 0 {
						return s[0].ID, nil
					}
				}
			}
		}
	}
	return "", fmt.Errorf("message not found (message_id=%s)", messageID)
}

func (r *AssistantRunner) shouldOnDemandRemember(userContent string) bool {
	s := strings.TrimSpace(userContent)
	if s == "" {
		return false
	}
	return strings.Contains(s, "记住") || strings.Contains(strings.ToLower(s), "remember")
}

func (r *AssistantRunner) extractFacts(ctx context.Context, cfg AssistantConfig, sessionText string, existing FactsFile) ([]string, error) {
	system := `You are a fact extraction engine.
Extract stable, user-specific facts from the conversation.
Return ONLY a JSON array of strings. Each string should be a concise fact sentence.
Prefer English "User ..." format (e.g. "User's name is Alex.").`
	user := "Conversation:\n" + sessionText + "\n\nExisting facts:\n" + formatFactsForContext(existing) + "\n\nReturn JSON array only."

	out, err := callChatCompletions(ctx, r.llmHTTPClient, cfg, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return nil, err
	}

	var arr []string
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &arr); err != nil {
		return nil, fmt.Errorf("fact engine invalid json: %w (raw=%s)", err, strings.TrimSpace(out))
	}
	clean := make([]string, 0, len(arr))
	for _, s := range arr {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		clean = append(clean, t)
	}
	return clean, nil
}

func (r *AssistantRunner) upsertFacts(now time.Time, facts FactsFile, newFacts []string) FactsFile {
	if facts.Facts == nil {
		facts.Facts = []Fact{}
	}

	existing := make(map[string]struct{}, len(facts.Facts))
	for _, f := range facts.Facts {
		key := strings.ToLower(strings.TrimSpace(f.Content))
		if key != "" {
			existing[key] = struct{}{}
		}
	}

	for _, nf := range newFacts {
		key := strings.ToLower(strings.TrimSpace(nf))
		if key == "" {
			continue
		}
		if _, ok := existing[key]; ok {
			continue
		}
		existing[key] = struct{}{}
		facts.Facts = append(facts.Facts, Fact{
			FactID:         nextFactID(facts.Facts),
			Content:        strings.TrimSpace(nf),
			CreatedAt:      now,
			LastAccessedAt: now,
		})
	}

	facts.Facts = applyFactLRUCap(facts.Facts, assistantMaxFacts)
	return facts
}

func (r *AssistantRunner) summarizeRecord(ctx context.Context, cfg AssistantConfig, recordText string) (string, error) {
	system := `You are a conversation summarizer.
Summarize the session record into 1-3 sentences, focusing on user intent, key events, and emotional tone.
Return plain text only.`
	user := "Session Record:\n" + recordText
	out, err := callChatCompletions(ctx, r.llmHTTPClient, cfg, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (r *AssistantRunner) appendSummary(now time.Time, summaries SummariesFile, recordID, summaryText string) SummariesFile {
	if summaries.Summaries == nil {
		summaries.Summaries = []Summary{}
	}
	summaryText = strings.TrimSpace(summaryText)
	if summaryText == "" || strings.TrimSpace(recordID) == "" {
		return summaries
	}
	for _, s := range summaries.Summaries {
		if s.RecordID == recordID {
			return summaries
		}
	}
	summaries.Summaries = append(summaries.Summaries, Summary{
		SummaryID: nextSummaryID(summaries.Summaries),
		RecordID:  recordID,
		Summary:   summaryText,
		CreatedAt: now,
	})
	if len(summaries.Summaries) > assistantMaxSummaries {
		summaries.Summaries = summaries.Summaries[len(summaries.Summaries)-assistantMaxSummaries:]
	}
	return summaries
}

func (r *AssistantRunner) processDMMessage(
	ctx context.Context,
	logPrefix string,
	socketMsg mewMessage,
	emit socketio.EmitFunc,
) error {
	userID := socketMsg.AuthorID()
	channelID := socketMsg.ChannelID
	now := socketMsg.CreatedAt
	if now.IsZero() {
		now = time.Now()
	}

	paths := assistantUserStatePaths(r.serviceType, r.botID, userID)
	log.Printf("%s state paths: user=%s meta=%s facts=%s summaries=%s",
		logPrefix, userID, paths.MetadataPath, paths.FactsPath, paths.SummariesPath,
	)
	facts, err := loadFacts(paths.FactsPath)
	if err != nil {
		return err
	}
	summaries, err := loadSummaries(paths.SummariesPath)
	if err != nil {
		return err
	}
	meta, err := loadMetadata(paths.MetadataPath)
	if err != nil {
		return err
	}

	if meta.ChannelID == "" {
		meta.ChannelID = channelID
	}

	delta := time.Duration(0)
	if !meta.LastMessageAt.IsZero() {
		delta = now.Sub(meta.LastMessageAt)
		if delta < 0 {
			delta = 0
		}
		meta.TimeSinceLastMessage = assistantTimeSincePrefix + sdk.HumanizeDuration(delta)
	} else {
		meta.TimeSinceLastMessage = assistantTimeSinceUnknown
	}

	newSession := meta.RecordID == "" || meta.LastMessageAt.IsZero() || delta > assistantSessionGap
	if newSession && meta.RecordID != "" && meta.ChannelID != "" && meta.LastSummarizedRecordID != meta.RecordID {
		log.Printf("%s session rollover detected: user=%s prevRecord=%s lastSummarized=%s",
			logPrefix, userID, meta.RecordID, meta.LastSummarizedRecordID,
		)
		if err := r.finalizeRecord(ctx, logPrefix, userID, paths, &meta); err != nil {
			log.Printf("%s finalize previous record failed (will retry later): %v", logPrefix, err)
		}
	}

	sessionMsgs, recordID, startAt, err := r.loadCurrentSessionRecord(ctx, channelID)
	if err != nil {
		return err
	}
	log.Printf("%s session record loaded: channel=%s record=%s start=%s msgs=%d persona=%q",
		logPrefix,
		channelID,
		recordID,
		startAt.Format(time.RFC3339),
		len(sessionMsgs),
		sdk.PreviewString(r.persona, assistantLogPersonaPreviewLen),
	)

	meta.RecordID = recordID
	meta.StartAt = startAt
	meta.LastMessageAt = now
	meta.ChannelID = channelID
	meta.SessionStartDatetime = startAt.Format(assistantSessionStartTimeFormat)

	if meta.UserActivityFrequency == "" {
		meta.UserActivityFrequency = assistantDefaultActivity
	}

	baseline := meta.BaselineMood
	lastFinal := meta.FinalMood
	if lastFinal == (Mood{}) {
		lastFinal = baseline
	}
	meta.InitialMood = computeInitialMood(baseline, lastFinal, delta)

	if err := saveMetadata(paths.MetadataPath, meta); err != nil {
		return err
	}

	facts.Facts = touchFactsUsedByContent(facts.Facts, socketMsg.Content, now)

	l1l4 := buildL1L4UserPrompt(meta, facts, summaries)
	l5, err := r.buildL5MessagesWithAttachments(ctx, sessionMsgs)
	if err != nil {
		log.Printf("%s build L5 with attachments failed (fallback to text-only): %v", logPrefix, err)
		l5 = buildL5Messages(sessionMsgs, r.botUserID)
	}
	log.Printf("%s prompt prepared: L1L4_len=%d L5_msgs=%d facts=%d summaries=%d",
		logPrefix,
		len(l1l4),
		len(l5),
		len(facts.Facts),
		len(summaries.Summaries),
	)
	reply, finalMood, gotMood, err := r.chatWithTools(ctx, strings.TrimSpace(r.persona), l1l4, l5, channelID)
	if err != nil {
		return err
	}

	if gotMood {
		meta.FinalMood = finalMood
		if err := saveMetadata(paths.MetadataPath, meta); err != nil {
			return err
		}
	}

	reply = strings.TrimSpace(reply)
	if reply == "" {
		log.Printf("%s empty reply: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}
	if strings.TrimSpace(reply) == assistantSilenceToken || strings.Contains(reply, assistantSilenceToken) {
		log.Printf("%s SILENCE: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}

	log.Printf("%s reply ready: channel=%s user=%s preview=%q",
		logPrefix, channelID, userID, sdk.PreviewString(reply, assistantLogContentPreviewLen),
	)

	linesSent := 0
	for _, line := range strings.Split(reply, "\n") {
		if linesSent >= assistantMaxReplyLines {
			break
		}
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		if err := emit(assistantUpstreamMessageCreate, map[string]any{
			"channelId": channelID,
			"content":   t,
		}); err != nil {
			return fmt.Errorf("send message failed: %w", err)
		}
		linesSent++
	}
	log.Printf("%s reply sent: channel=%s user=%s lines=%d", logPrefix, channelID, userID, linesSent)

	if r.shouldOnDemandRemember(socketMsg.Content) {
		log.Printf("%s fact engine on-demand: channel=%s user=%s", logPrefix, channelID, userID)
		sessionText := formatSessionRecordForContext(sessionMsgs)
		if extracted, err := r.extractFacts(ctx, r.llmConfig, sessionText, facts); err == nil && len(extracted) > 0 {
			facts = r.upsertFacts(now, facts, extracted)
			_ = saveFacts(paths.FactsPath, facts)
			log.Printf("%s facts updated (on-demand): user=%s count=%d", logPrefix, userID, len(facts.Facts))
		} else if err != nil {
			log.Printf("%s fact engine on-demand failed: user=%s err=%v", logPrefix, userID, err)
		}
	}

	return nil
}

func (r *AssistantRunner) finalizeRecord(ctx context.Context, logPrefix, userID string, paths userStatePaths, meta *Metadata) error {
	now := time.Now()

	facts, err := loadFacts(paths.FactsPath)
	if err != nil {
		return err
	}
	summaries, err := loadSummaries(paths.SummariesPath)
	if err != nil {
		return err
	}

	msgs, err := r.recordSearch(ctx, meta.ChannelID, meta.RecordID)
	if err != nil {
		return err
	}
	recordText := formatSessionRecordForContext(msgs)

	if summaryText, err := r.summarizeRecord(ctx, r.llmConfig, recordText); err == nil && strings.TrimSpace(summaryText) != "" {
		summaries = r.appendSummary(now, summaries, meta.RecordID, summaryText)
		_ = saveSummaries(paths.SummariesPath, summaries)
		meta.LastSummarizedRecordID = meta.RecordID
		_ = saveMetadata(paths.MetadataPath, *meta)
		log.Printf("%s summary saved: user=%s record=%s summaries=%d preview=%q",
			logPrefix, userID, meta.RecordID, len(summaries.Summaries), sdk.PreviewString(summaryText, assistantLogContentPreviewLen),
		)
	} else if err != nil {
		log.Printf("%s summarize failed: user=%s record=%s err=%v", logPrefix, userID, meta.RecordID, err)
	}

	if extracted, err := r.extractFacts(ctx, r.llmConfig, recordText, facts); err == nil && len(extracted) > 0 {
		facts = r.upsertFacts(now, facts, extracted)
		_ = saveFacts(paths.FactsPath, facts)
		log.Printf("%s facts updated (end-of-session): user=%s count=%d", logPrefix, userID, len(facts.Facts))
	} else if err != nil {
		log.Printf("%s fact engine end-of-session failed: user=%s err=%v", logPrefix, userID, err)
	}

	log.Printf("%s record finalized: user=%s record=%s", logPrefix, userID, meta.RecordID)
	return nil
}

func (r *AssistantRunner) chatWithTools(ctx context.Context, personaSystem, firstUserPrompt string, l5 []chatMessage, channelID string) (reply string, finalMood Mood, gotMood bool, err error) {
	messages := make([]chatMessage, 0, 2+len(l5)+assistantMaxToolCalls*2)
	messages = append(messages,
		chatMessage{Role: "system", Content: strings.TrimSpace(personaSystem)},
		chatMessage{Role: "user", Content: strings.TrimSpace(firstUserPrompt)},
	)
	messages = append(messages, l5...)

	for i := 0; i <= assistantMaxToolCalls; i++ {
		log.Printf("%s llm call: channel=%s attempt=%d messages=%d", assistantLogPrefix, channelID, i+1, len(messages))
		r.logLLMMessages(assistantLogPrefix, channelID, messages)
		out, err := callChatCompletions(ctx, r.llmHTTPClient, r.llmConfig, messages)
		if err != nil {
			return "", Mood{}, false, err
		}
		log.Printf("%s llm output preview: channel=%s %q", assistantLogPrefix, channelID, sdk.PreviewString(out, assistantLogLLMPreviewLen))

		if tc, ok := parseToolCallLine(out); ok {
			messages = append(messages, chatMessage{Role: "assistant", Content: out})
			toolName := tc.Tool
			log.Printf("%s tool call: channel=%s tool=%s args=%v", assistantLogPrefix, channelID, toolName, tc.Args)
			switch toolName {
			case toolHistorySearch:
				keyword, _ := tc.Args["keyword"].(string)
				if strings.TrimSpace(keyword) == "" {
					keyword, _ = tc.Args["query"].(string)
				}
				payload, err := r.runHistorySearch(ctx, channelID, keyword)
				if err != nil {
					messages = append(messages, openai.ToolResultMessage(toolName, map[string]any{"error": err.Error()}))
				} else {
					messages = append(messages, openai.ToolResultMessage(toolName, payload))
				}
				log.Printf("%s tool result: channel=%s tool=%s preview=%q",
					assistantLogPrefix, channelID, toolName, sdk.PreviewString(fmt.Sprintf("%v", payload), assistantLogToolResultPreviewLen),
				)
				continue
			case toolRecordSearch:
				recordID, _ := tc.Args["record_id"].(string)
				if strings.TrimSpace(recordID) == "" {
					recordID, _ = tc.Args["recordId"].(string)
				}
				payload, err := r.runRecordSearch(ctx, channelID, recordID)
				if err != nil {
					messages = append(messages, openai.ToolResultMessage(toolName, map[string]any{"error": err.Error()}))
				} else {
					messages = append(messages, openai.ToolResultMessage(toolName, payload))
				}
				log.Printf("%s tool result: channel=%s tool=%s preview=%q",
					assistantLogPrefix, channelID, toolName, sdk.PreviewString(fmt.Sprintf("%v", payload), assistantLogToolResultPreviewLen),
				)
				continue
			default:
				messages = append(messages, openai.ToolResultMessage("UnknownTool", map[string]any{"error": "unknown tool: " + toolName}))
				continue
			}
		}

		clean, mood, ok := extractAndStripFinalMood(out)
		if ok {
			log.Printf("%s final_mood parsed: channel=%s valence=%.4f arousal=%.4f", assistantLogPrefix, channelID, mood.Valence, mood.Arousal)
		}
		return clean, mood, ok, nil
	}

	return "", Mood{}, false, fmt.Errorf("tool loop exceeded")
}

func (r *AssistantRunner) logLLMMessages(logPrefix, channelID string, messages []chatMessage) {
	b, err := json.MarshalIndent(messages, "", "  ")
	if err != nil {
		log.Printf("%s llm messages marshal failed: channel=%s err=%v", logPrefix, channelID, err)
		return
	}
	log.Printf("%s llm messages: channel=%s\n%s", logPrefix, channelID, string(b))
}

func (r *AssistantRunner) runHistorySearch(ctx context.Context, channelID, keyword string) (any, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return map[string]any{"messages": []any{}}, nil
	}
	msgs, err := sdk.SearchChannelMessages(ctx, r.mewHTTPClient, r.apiBase, r.userToken, channelID, keyword, 10, 1)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		rid, err := r.recordIDForMessage(ctx, channelID, m.ID)
		recordID := ""
		if err == nil {
			recordID = rid
		}
		out = append(out, map[string]any{
			"id":        m.ID,
			"createdAt": m.CreatedAt.Format(time.RFC3339),
			"authorId":  m.AuthorID(),
			"author":    m.AuthorUsername(),
			"content":   m.Content,
			"recordId":  recordID,
		})
	}
	return map[string]any{"keyword": keyword, "messages": out}, nil
}

func (r *AssistantRunner) runRecordSearch(ctx context.Context, channelID, recordID string) (any, error) {
	msgs, err := r.recordSearch(ctx, channelID, recordID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"recordId": recordID,
		"text":     formatSessionRecordForContext(msgs),
	}, nil
}

func (r *AssistantRunner) loadCurrentSessionRecord(ctx context.Context, channelID string) (sessionMsgs []mewMessage, recordID string, startAt time.Time, err error) {
	var desc []mewMessage
	before := ""

	for page := 0; page < assistantMaxFetchPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, r.mewHTTPClient, r.apiBase, r.userToken, channelID, assistantFetchPageSize, before)
		if err != nil {
			return nil, "", time.Time{}, err
		}
		if len(msgs) == 0 {
			break
		}
		desc = append(desc, msgs...)
		before = msgs[len(msgs)-1].ID

		curCount, boundaryFound := mew.CurrentSessionCountInDesc(desc, assistantSessionGap, assistantMaxSessionMessages)
		if curCount >= assistantMaxSessionMessages || boundaryFound {
			desc = desc[:curCount]
			break
		}
	}

	if len(desc) == 0 {
		return nil, "", time.Time{}, fmt.Errorf("no messages in channel=%s", channelID)
	}

	mew.ReverseMessagesInPlace(desc)
	if len(desc) > assistantMaxSessionMessages {
		desc = desc[len(desc)-assistantMaxSessionMessages:]
	}
	sessionMsgs = desc
	recordID = sessionMsgs[0].ID
	startAt = sessionMsgs[0].CreatedAt
	if startAt.IsZero() {
		startAt = time.Now()
	}
	return sessionMsgs, recordID, startAt, nil
}
