package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/ai"
	mewacl "mew/plugins/assistant-agent/internal/mew"
	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
	"mew/plugins/sdk/client/socketio"
)

func (r *Runner) handleMessageCreate(
	ctx context.Context,
	logPrefix string,
	payload json.RawMessage,
	emit socketio.EmitFunc,
) error {
	var msg mewacl.Message
	if err := json.Unmarshal(payload, &msg); err != nil {
		return err
	}
	if strings.TrimSpace(msg.ChannelID) == "" || strings.TrimSpace(msg.ID) == "" {
		return nil
	}
	if r.isOwnAuthor(msg.AuthorRaw) {
		return nil
	}

	channelID := msg.ChannelID
	trimmed := strings.TrimSpace(msg.Content)
	rest, mentioned := socketio.StripLeadingBotMention(trimmed, r.botUserID)

	isDM := r.isDMChannel(channelID)

	// If it's neither a known DM channel nor a leading-mention in a guild channel, it might be a newly created DM.
	if !isDM && !mentioned {
		if err := r.refreshDMChannels(ctx); err != nil {
			return nil
		}
		isDM = r.isDMChannel(channelID)
		if !isDM {
			return nil
		}
	}

	// In guild channels, only reply when directly @mentioned at the beginning.
	if !isDM && !mentioned {
		return nil
	}

	// Strip leading mention for both guild + DM (if present), to keep the user prompt clean.
	if mentioned {
		msg.Content = rest
		msg.Context = rest
	}

	userID := msg.AuthorID()
	if userID == "" {
		return nil
	}

	mode := "DM"
	if !isDM {
		mode = "CHANNEL"
	}
	log.Printf("%s %s MESSAGE_CREATE: channel=%s msg=%s user=%s content=%q",
		logPrefix,
		mode,
		channelID,
		msg.ID,
		userID,
		sdk.PreviewString(msg.Content, assistantLogContentPreviewLen),
	)

	r.knownUsersMu.Lock()
	r.knownUsers[userID] = struct{}{}
	r.knownUsersMu.Unlock()

	lock := r.userMutex(userID)
	lock.Lock()
	defer lock.Unlock()

	return r.processDMMessage(ctx, logPrefix, msg, emit)
}

func (r *Runner) isOwnAuthor(authorRaw json.RawMessage) bool {
	return sdk.IsOwnMessage(authorRaw, r.botUserID)
}

func (r *Runner) isDMChannel(channelID string) bool {
	return r.dmChannels.Has(channelID)
}

func (r *Runner) shouldOnDemandRemember(userContent string) bool {
	s := strings.TrimSpace(userContent)
	if s == "" {
		return false
	}
	return strings.Contains(s, "记住") || strings.Contains(strings.ToLower(s), "remember")
}

func assistantReplyDelayForLine(line string) time.Duration {
	n := len([]rune(strings.TrimSpace(line)))
	if n <= 0 {
		return 0
	}
	d := assistantReplyDelayBase + time.Duration(n)*assistantReplyDelayPerRune
	if d > assistantReplyDelayMax {
		return assistantReplyDelayMax
	}
	return d
}

func sleepWithContext(ctx context.Context, d time.Duration) {
	if d <= 0 {
		return
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return
	case <-t.C:
		return
	}
}

func (r *Runner) processDMMessage(
	ctx context.Context,
	logPrefix string,
	socketMsg mewacl.Message,
	emit socketio.EmitFunc,
) error {
	userID := socketMsg.AuthorID()
	channelID := socketMsg.ChannelID
	now := socketMsg.CreatedAt
	if now.IsZero() {
		now = time.Now()
	}

	paths, facts, summaries, meta, err := r.loadUserState(userID, logPrefix)
	if err != nil {
		return err
	}

	delta, prevRecordID, newSession := r.applyTiming(&meta, channelID, now)
	if newSession {
		r.tryFinalizePreviousSession(ctx, logPrefix, userID, paths, &meta)
	}

	sessionMsgs, recordID, startAt, err := r.fetcher.FetchSessionMessages(ctx, channelID)
	if err != nil {
		return err
	}
	log.Printf("%s session record loaded: channel=%s record=%s start=%s msgs=%d persona=%q",
		logPrefix, channelID, recordID, startAt.Format(time.RFC3339), len(sessionMsgs), sdk.PreviewString(r.persona, assistantLogPersonaPreviewLen),
	)

	if err := r.updateSessionState(ctx, userID, channelID, now, startAt, recordID, prevRecordID, delta, &meta); err != nil {
		return err
	}
	if err := store.SaveMetadata(paths.MetadataPath, meta); err != nil {
		return err
	}

	l1l4, l5 := r.buildPrompt(ctx, meta, facts, summaries, sessionMsgs, logPrefix)
	reply, finalMood, gotMood, err := r.reply(ctx, emit, channelID, userID, l1l4, l5, logPrefix)
	if err != nil {
		return err
	}

	if gotMood {
		meta.FinalMood = finalMood
		if err := store.SaveMetadata(paths.MetadataPath, meta); err != nil {
			return err
		}
	}

	clean, controls := parseReplyControls(reply)
	if err := r.sendReply(ctx, emit, channelID, userID, clean, controls, logPrefix); err != nil {
		return err
	}
	r.maybeEnqueueProactive(now, paths, channelID, recordID, controls.proactive, logPrefix)

	// If the model explicitly asks for a continuation, prompt it once more.
	if controls.wantMore {
		l5More := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(l5)+2)
		l5More = append(l5More, l5...)
		if strings.TrimSpace(clean) != "" {
			l5More = append(l5More, openaigo.AssistantMessage(strings.TrimSpace(clean)))
		}
		l5More = append(l5More, openaigo.UserMessage("(you want to say more)"))

		more, moreMood, moreGotMood, moreErr := r.reply(ctx, emit, channelID, userID, l1l4, l5More, logPrefix)
		if moreErr != nil {
			return moreErr
		}
		if moreGotMood {
			meta.FinalMood = moreMood
			if err := store.SaveMetadata(paths.MetadataPath, meta); err != nil {
				return err
			}
		}

		moreClean, moreControls := parseReplyControls(more)
		if err := r.sendReply(ctx, emit, channelID, userID, moreClean, moreControls, logPrefix); err != nil {
			return err
		}
		r.maybeEnqueueProactive(now, paths, channelID, recordID, moreControls.proactive, logPrefix)
	}
	r.maybeOnDemandRemember(ctx, socketMsg.Content, sessionMsgs, facts, paths, userID, channelID, now, logPrefix)
	return nil
}

func (r *Runner) loadUserState(userID, logPrefix string) (paths store.UserStatePaths, facts store.FactsFile, summaries store.SummariesFile, meta store.Metadata, err error) {
	paths = r.store.Paths(userID)
	log.Printf("%s state paths: user=%s meta=%s facts=%s summaries=%s",
		logPrefix, userID, paths.MetadataPath, paths.FactsPath, paths.SummariesPath,
	)
	facts, err = store.LoadFacts(paths.FactsPath)
	if err != nil {
		return store.UserStatePaths{}, store.FactsFile{}, store.SummariesFile{}, store.Metadata{}, err
	}
	summaries, err = store.LoadSummaries(paths.SummariesPath)
	if err != nil {
		return store.UserStatePaths{}, store.FactsFile{}, store.SummariesFile{}, store.Metadata{}, err
	}
	meta, err = store.LoadMetadata(paths.MetadataPath)
	if err != nil {
		return store.UserStatePaths{}, store.FactsFile{}, store.SummariesFile{}, store.Metadata{}, err
	}
	return paths, facts, summaries, meta, nil
}

func (r *Runner) applyTiming(meta *store.Metadata, channelID string, now time.Time) (delta time.Duration, prevRecordID string, newSession bool) {
	prevRecordID = meta.RecordID
	if meta.ChannelID == "" {
		meta.ChannelID = channelID
	}

	delta = 0
	if !meta.LastMessageAt.IsZero() {
		delta = now.Sub(meta.LastMessageAt)
		if delta < 0 {
			delta = 0
		}
		meta.TimeSinceLastMessage = assistantTimeSincePrefix + sdk.HumanizeDuration(delta)
	} else {
		meta.TimeSinceLastMessage = assistantTimeSinceUnknown
	}
	newSession = meta.RecordID == "" || meta.LastMessageAt.IsZero() || delta > assistantSessionGap
	return delta, prevRecordID, newSession
}

func (r *Runner) tryFinalizePreviousSession(ctx context.Context, logPrefix, userID string, paths store.UserStatePaths, meta *store.Metadata) {
	if meta.RecordID == "" || meta.ChannelID == "" || meta.LastSummarizedRecordID == meta.RecordID {
		return
	}
	log.Printf("%s session rollover detected: user=%s prevRecord=%s lastSummarized=%s",
		logPrefix, userID, meta.RecordID, meta.LastSummarizedRecordID,
	)
	if err := r.finalizeRecord(ctx, logPrefix, userID, paths, meta); err != nil {
		log.Printf("%s finalize previous record failed (will retry later): %v", logPrefix, err)
	}
}

func (r *Runner) updateSessionState(
	ctx context.Context,
	userID, channelID string,
	now, startAt time.Time,
	recordID, prevRecordID string,
	delta time.Duration,
	meta *store.Metadata,
) error {
	meta.RecordID = recordID
	meta.StartAt = startAt
	meta.LastMessageAt = now
	meta.ChannelID = channelID
	startAtLocal := startAt
	if r.timeLoc != nil && !startAtLocal.IsZero() {
		startAtLocal = startAtLocal.In(r.timeLoc)
	}
	meta.SessionStartDatetime = startAtLocal.Format(assistantSessionStartTimeFormat)
	if strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		meta.LastFactRecordID = ""
		meta.LastFactProcessedAt = time.Time{}
	}

	if meta.UserActivityFrequency == "" || strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		if freq, err := r.fetcher.UserActivityFrequency(ctx, channelID, userID, startAtLocal); err == nil && strings.TrimSpace(freq) != "" {
			meta.UserActivityFrequency = freq
		} else if strings.TrimSpace(meta.UserActivityFrequency) == "" {
			meta.UserActivityFrequency = assistantDefaultActivity
		}
	}

	baseline := meta.BaselineMood
	lastFinal := meta.FinalMood
	if lastFinal == (store.Mood{}) {
		lastFinal = baseline
	}
	meta.InitialMood = store.ComputeInitialMood(baseline, lastFinal, delta)
	return nil
}

func (r *Runner) buildPrompt(
	ctx context.Context,
	meta store.Metadata,
	facts store.FactsFile,
	summaries store.SummariesFile,
	sessionMsgs []mewacl.Message,
	logPrefix string,
) (l1l4 string, l5 []openaigo.ChatCompletionMessageParamUnion) {
	stickerNames := strings.TrimSpace(r.stickerPromptAddon(ctx, logPrefix))
	l1l4 = ai.BuildL1L4UserPrompt(ai.DeveloperInstructionsText(
		assistantSilenceToken,
		assistantWantMoreToken,
		assistantProactiveTokenPrefix,
		assistantToolCallTokenPrefix,
		assistantStickerTokenPrefix,
		stickerNames,
		DeveloperInstructionsPromptRelPath,
		DeveloperInstructionsEmbeddedName,
	), meta, facts, summaries)
	l5, err := ai.BuildL5MessagesWithAttachments(ctx, sessionMsgs, r.botUserID, ai.UserContentPartsOptions{
		DefaultImagePrompt:    DefaultImagePrompt,
		MaxImageBytes:         DefaultMaxImageBytes,
		MaxTotalImageBytes:    DefaultMaxTotalImageBytes,
		KeepEmptyWhenNoImages: true,
		Location:              r.timeLoc,
		Download: func(ctx context.Context, att mewacl.Attachment, limit int64) ([]byte, error) {
			return mewacl.DownloadAttachmentBytes(ctx, r.mewHTTPClient, r.apiBase, r.userToken, att, limit)
		},
	})
	if err != nil {
		log.Printf("%s build L5 with attachments failed (fallback to text-only): %v", logPrefix, err)
		l5 = ai.BuildL5Messages(sessionMsgs, r.botUserID, r.timeLoc)
	}
	log.Printf("%s prompt prepared: L1L4_len=%d L5_msgs=%d facts=%d summaries=%d",
		logPrefix, len(l1l4), len(l5), len(facts.Facts), len(summaries.Summaries),
	)
	return l1l4, l5
}

func (r *Runner) reply(
	ctx context.Context,
	emit socketio.EmitFunc,
	channelID string,
	userID string,
	l1l4 string,
	l5 []openaigo.ChatCompletionMessageParamUnion,
	logPrefix string,
) (reply string, finalMood store.Mood, gotMood bool, err error) {
	return ai.ChatWithTools(ctx, r.llmHTTPClient, r.aiConfig, strings.TrimSpace(r.persona), l1l4, l5, ai.ToolHandlers{
		HistorySearch: func(ctx context.Context, keyword string) (any, error) {
			return r.runHistorySearch(ctx, channelID, keyword)
		},
		RecordSearch: func(ctx context.Context, recordID string) (any, error) {
			return r.runRecordSearch(ctx, channelID, recordID)
		},
		WebSearch: func(ctx context.Context, query string) (any, error) {
			return r.runWebSearch(ctx, query)
		},
	}, ai.ChatWithToolsOptions{
		MaxToolCalls:          assistantMaxToolCalls,
		HistorySearchToolName: DefaultHistorySearchToolName,
		RecordSearchToolName:  DefaultRecordSearchToolName,
		WebSearchToolName:     DefaultWebSearchToolName,
		LogPrefix:             assistantLogPrefix,
		ChannelID:             channelID,
		LLMPreviewLen:         assistantLogLLMPreviewLen,
		ToolResultPreviewLen:  assistantLogToolResultPreviewLen,
		OnToolCallAssistantText: func(text string) error {
			return r.sendToolPrelude(ctx, emit, channelID, userID, text, logPrefix)
		},
		SilenceToken:           assistantSilenceToken,
		WantMoreToken:          assistantWantMoreToken,
		ProactiveTokenPrefix:   assistantProactiveTokenPrefix,
		StickerTokenPrefix:     assistantStickerTokenPrefix,
		MaxLLMRetries:          assistantMaxLLMRetries,
		LLMRetryInitialBackoff: assistantLLMRetryInitialBackoff,
		LLMRetryMaxBackoff:     assistantLLMRetryMaxBackoff,
	})
}

func (r *Runner) sendToolPrelude(
	ctx context.Context,
	emit socketio.EmitFunc,
	channelID string,
	userID string,
	text string,
	logPrefix string,
) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	sendErr := emit(assistantUpstreamMessageCreate, map[string]any{
		"channelId": channelID,
		"content":   text,
	})
	if sendErr != nil {
		// Fallback: if the gateway is disconnected, use REST API.
		if err := r.postMessageHTTP(ctx, channelID, text); err != nil {
			return fmt.Errorf("send tool prelude failed (gateway=%v http=%v)", sendErr, err)
		}
		log.Printf("%s gateway send prelude failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
	}
	return nil
}

func (r *Runner) sendReply(ctx context.Context, emit socketio.EmitFunc, channelID, userID, reply string, controls replyControls, logPrefix string) error {
	reply = strings.TrimSpace(reply)
	stickerName := ""
	if controls.sticker != nil {
		stickerName = strings.TrimSpace(controls.sticker.Name)
	}

	if reply == "" && stickerName == "" {
		log.Printf("%s empty reply: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}
	if strings.TrimSpace(reply) == assistantSilenceToken || strings.Contains(reply, assistantSilenceToken) {
		log.Printf("%s SILENCE: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}

	if reply != "" {
		log.Printf("%s reply ready: channel=%s user=%s preview=%q",
			logPrefix, channelID, userID, sdk.PreviewString(reply, assistantLogContentPreviewLen),
		)

		lines := make([]string, 0, assistantMaxReplyLines)
		for _, line := range strings.Split(reply, "\n") {
			if len(lines) >= assistantMaxReplyLines {
				break
			}
			t := strings.TrimSpace(line)
			if t == "" {
				continue
			}
			lines = append(lines, t)
		}

		linesSent := 0
		for i, t := range lines {
			sendErr := emit(assistantUpstreamMessageCreate, map[string]any{
				"channelId": channelID,
				"content":   t,
			})
			if sendErr != nil {
				// Fallback: if the gateway is disconnected between reply generation and send, use REST API.
				if err := r.postMessageHTTP(ctx, channelID, t); err != nil {
					return fmt.Errorf("send message failed (gateway=%v http=%v)", sendErr, err)
				}
				log.Printf("%s gateway send failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
			}
			linesSent++
			if i < len(lines)-1 {
				sleepWithContext(ctx, assistantReplyDelayForLine(t))
			}
		}
		log.Printf("%s reply sent: channel=%s user=%s lines=%d", logPrefix, channelID, userID, linesSent)
	}

	if stickerName != "" {
		stickerID, err := r.resolveStickerIDByName(ctx, logPrefix, stickerName)
		if err != nil {
			return err
		}
		if strings.TrimSpace(stickerID) == "" {
			log.Printf("%s sticker not found in group: channel=%s user=%s name=%q", logPrefix, channelID, userID, stickerName)
			return nil
		}

		sendErr := emit(assistantUpstreamMessageCreate, map[string]any{
			"channelId": channelID,
			"type":      "message/sticker",
			"payload": map[string]any{
				"stickerId":    stickerID,
				"stickerScope": "user",
			},
		})
		if sendErr != nil {
			if err := r.postStickerHTTP(ctx, channelID, stickerID); err != nil {
				return fmt.Errorf("send sticker failed (gateway=%v http=%v)", sendErr, err)
			}
			log.Printf("%s gateway sticker send failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
		}
		log.Printf("%s sticker sent: channel=%s user=%s name=%q", logPrefix, channelID, userID, stickerName)
	}

	return nil
}

func (r *Runner) postMessageHTTP(ctx context.Context, channelID, content string) error {
	if r.mewHTTPClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(r.userToken) == "" {
		return fmt.Errorf("missing user token")
	}
	if strings.TrimSpace(r.apiBase) == "" {
		return fmt.Errorf("missing api base")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return fmt.Errorf("missing channel id")
	}

	u := strings.TrimRight(r.apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	body, _ := json.Marshal(map[string]any{"content": content})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(r.userToken))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.mewHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func (r *Runner) postStickerHTTP(ctx context.Context, channelID, stickerID string) error {
	if r.mewHTTPClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(r.userToken) == "" {
		return fmt.Errorf("missing user token")
	}
	if strings.TrimSpace(r.apiBase) == "" {
		return fmt.Errorf("missing api base")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return fmt.Errorf("missing channel id")
	}
	stickerID = strings.TrimSpace(stickerID)
	if stickerID == "" {
		return fmt.Errorf("missing sticker id")
	}

	u := strings.TrimRight(r.apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	body, _ := json.Marshal(map[string]any{
		"type": "message/sticker",
		"payload": map[string]any{
			"stickerId":    stickerID,
			"stickerScope": "user",
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(r.userToken))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.mewHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func (r *Runner) maybeOnDemandRemember(
	ctx context.Context,
	userContent string,
	sessionMsgs []mewacl.Message,
	facts store.FactsFile,
	paths store.UserStatePaths,
	userID, channelID string,
	now time.Time,
	logPrefix string,
) {
	if !r.shouldOnDemandRemember(userContent) {
		return
	}

	log.Printf("%s fact engine on-demand: channel=%s user=%s", logPrefix, channelID, userID)
	sessionText := ai.FormatSessionRecordForContext(sessionMsgs)
	res, err := ai.ExtractFactsAndUsageWithRetry(ctx, r.llmHTTPClient, r.aiConfig, sessionText, facts, ai.CognitiveRetryOptions{
		MaxRetries:     assistantMaxLLMRetries,
		InitialBackoff: assistantLLMRetryInitialBackoff,
		MaxBackoff:     assistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      channelID,
	})
	if err != nil || (len(res.Facts) == 0 && len(res.UsedFactIDs) == 0) {
		if err != nil {
			log.Printf("%s fact engine on-demand failed: user=%s err=%v", logPrefix, userID, err)
		}
		return
	}

	facts.Facts = store.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
	facts = store.UpsertFacts(now, facts, res.Facts, assistantMaxFacts)
	_ = store.SaveFacts(paths.FactsPath, facts)
	log.Printf("%s facts updated (on-demand): user=%s count=%d used=%d new=%d", logPrefix, userID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
}

func (r *Runner) finalizeRecord(ctx context.Context, logPrefix, userID string, paths store.UserStatePaths, meta *store.Metadata) error {
	now := time.Now()

	facts, err := store.LoadFacts(paths.FactsPath)
	if err != nil {
		return err
	}
	summaries, err := store.LoadSummaries(paths.SummariesPath)
	if err != nil {
		return err
	}

	msgs, err := r.fetcher.RecordSearch(ctx, meta.ChannelID, meta.RecordID)
	if err != nil {
		return err
	}
	recordText := ai.FormatSessionRecordForContext(msgs)

	if summaryText, err := ai.SummarizeRecordWithRetry(ctx, r.llmHTTPClient, r.aiConfig, recordText, ai.CognitiveRetryOptions{
		MaxRetries:     assistantMaxLLMRetries,
		InitialBackoff: assistantLLMRetryInitialBackoff,
		MaxBackoff:     assistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && strings.TrimSpace(summaryText) != "" {
		summaries = store.AppendSummary(now, summaries, meta.RecordID, summaryText, assistantMaxSummaries)
		_ = store.SaveSummaries(paths.SummariesPath, summaries)
		meta.LastSummarizedRecordID = meta.RecordID
		_ = store.SaveMetadata(paths.MetadataPath, *meta)
		log.Printf("%s summary saved: user=%s record=%s summaries=%d preview=%q",
			logPrefix, userID, meta.RecordID, len(summaries.Summaries), sdk.PreviewString(summaryText, assistantLogContentPreviewLen),
		)
	} else if err != nil {
		log.Printf("%s summarize failed: user=%s record=%s err=%v", logPrefix, userID, meta.RecordID, err)
	}

	if res, err := ai.ExtractFactsAndUsageWithRetry(ctx, r.llmHTTPClient, r.aiConfig, recordText, facts, ai.CognitiveRetryOptions{
		MaxRetries:     assistantMaxLLMRetries,
		InitialBackoff: assistantLLMRetryInitialBackoff,
		MaxBackoff:     assistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && (len(res.Facts) > 0 || len(res.UsedFactIDs) > 0) {
		facts.Facts = store.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
		facts = store.UpsertFacts(now, facts, res.Facts, assistantMaxFacts)
		_ = store.SaveFacts(paths.FactsPath, facts)
		log.Printf("%s facts updated (end-of-session): user=%s count=%d used=%d new=%d", logPrefix, userID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
	} else if err != nil {
		log.Printf("%s fact engine end-of-session failed: user=%s err=%v", logPrefix, userID, err)
	}

	log.Printf("%s record finalized: user=%s record=%s", logPrefix, userID, meta.RecordID)
	return nil
}
