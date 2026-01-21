package agent

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/chat"
	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/internal/agents/assistant-agent/proactive"
	"mew/plugins/internal/agents/assistant-agent/tools"
	"mew/plugins/pkg"
	sdkapi "mew/plugins/pkg/api"
	"mew/plugins/pkg/api/attachment"
	"mew/plugins/pkg/api/gateway/socketio"
)

func (r *Runner) handleMessageCreate(
	ctx context.Context,
	logPrefix string,
	payload json.RawMessage,
	emit socketio.EmitFunc,
) error {
	var msg sdkapi.ChannelMessage
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
		sdk.PreviewString(msg.Content, infra.AssistantLogContentPreviewLen),
	)

	r.knownUsersMu.Lock()
	r.knownUsers[userID] = struct{}{}
	r.knownUsersMu.Unlock()

	r.conversations.get(channelID, userID).Submit(chat.ConversationRequest{
		Ctx:       ctx,
		Transport: r.buildChatTransport(r.newRequestContext(ctx, userID, channelID, logPrefix), emit),
		Run: func(runCtx context.Context, send func([]chat.SendEvent), prelude func(string)) error {
			if err := r.processDMMessage(runCtx, logPrefix, msg, send, prelude); err != nil {
				if runCtx.Err() != nil {
					return nil
				}
				return err
			}
			return nil
		},
	})
	return nil
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

func (r *Runner) processDMMessage(
	ctx context.Context,
	logPrefix string,
	socketMsg sdkapi.ChannelMessage,
	send func([]chat.SendEvent),
	prelude func(string),
) error {
	select {
	case <-ctx.Done():
		return nil
	default:
	}

	userID := socketMsg.AuthorID()
	channelID := socketMsg.ChannelID
	reqCtx := r.newRequestContext(ctx, userID, channelID, logPrefix)
	now := socketMsg.CreatedAt
	if now.IsZero() {
		now = time.Now()
	}

	state, err := r.loadUserState(reqCtx)
	if err != nil {
		return err
	}

	delta, prevRecordID, newSession := r.applyTiming(&state.Metadata, reqCtx.ChannelID, now)
	if newSession {
		r.tryFinalizePreviousSession(reqCtx, &state)
	}

	sessionMsgs, recordID, startAt, err := r.fetcher.FetchSessionMessages(reqCtx.Ctx, reqCtx.ChannelID)
	if err != nil {
		return err
	}
	log.Printf("%s session record loaded: channel=%s record=%s start=%s msgs=%d persona=%q",
		reqCtx.LogPrefix, reqCtx.ChannelID, recordID, startAt.Format(time.RFC3339), len(sessionMsgs), sdk.PreviewString(r.persona, infra.AssistantLogPersonaPreviewLen),
	)

	if err := r.updateSessionState(reqCtx, now, startAt, recordID, prevRecordID, delta, &state); err != nil {
		return err
	}
	if err := state.SaveMetadata(); err != nil {
		return err
	}

	l1l4, l5 := r.buildPrompt(reqCtx, state, sessionMsgs)
	reply, finalMood, gotMood, err := r.reply(reqCtx, l1l4, l5, func(text string) error {
		if prelude != nil {
			prelude(text)
		}
		return nil
	})
	if err != nil {
		return err
	}

	if gotMood {
		state.Metadata.FinalMood = finalMood
		if err := state.SaveMetadata(); err != nil {
			return err
		}
	}

	clean, controls := chat.ParseReplyControls(reply)
	if send != nil {
		send(r.buildSendEventsWithVoicePrefetch(reqCtx, ctx, clean, controls))
	}
	r.enqueueProactive(reqCtx, now, state, recordID, controls.Proactive)

	// If the model explicitly asks for a continuation, prompt it once more.
	if controls.WantMore {
		l5More := make([]openaigo.ChatCompletionMessageParamUnion, 0, len(l5)+2)
		l5More = append(l5More, l5...)
		if strings.TrimSpace(clean) != "" {
			l5More = append(l5More, openaigo.AssistantMessage(strings.TrimSpace(clean)))
		}
		l5More = append(l5More, openaigo.UserMessage("(you want to say more)"))

		more, moreMood, moreGotMood, moreErr := r.reply(reqCtx, l1l4, l5More, func(text string) error {
			if prelude != nil {
				prelude(text)
			}
			return nil
		})
		if moreErr != nil {
			return moreErr
		}
		if moreGotMood {
			state.Metadata.FinalMood = moreMood
			if err := state.SaveMetadata(); err != nil {
				return err
			}
		}

		moreClean, moreControls := chat.ParseReplyControls(more)
		if send != nil {
			send(r.buildSendEventsWithVoicePrefetch(reqCtx, ctx, moreClean, moreControls))
		}
		r.enqueueProactive(reqCtx, now, state, recordID, moreControls.Proactive)
	}
	r.maybeOnDemandRemember(reqCtx, socketMsg.Content, sessionMsgs, &state, now)
	return nil
}

func (r *Runner) enqueueProactive(c infra.AssistantRequestContext, now time.Time, s UserState, recordID string, d *chat.ProactiveDirective) {
	req, ok := proactive.BuildProactiveRequest(now, c.ChannelID, recordID, d)
	if !ok {
		return
	}

	q, err := LoadProactiveQueue(s.Paths.ProactivePath)
	if err != nil {
		log.Printf("%s load proactive queue failed: path=%s err=%v", c.LogPrefix, s.Paths.ProactivePath, err)
		return
	}
	q = proactive.AppendProactiveRequest(now, q, req, infra.AssistantMaxProactiveQueue)
	if err := SaveProactiveQueue(s.Paths.ProactivePath, q); err != nil {
		log.Printf("%s save proactive queue failed: path=%s err=%v", c.LogPrefix, s.Paths.ProactivePath, err)
		return
	}

	log.Printf("%s proactive queued: channel=%s record=%s at=%s reason=%q",
		c.LogPrefix,
		req.ChannelID,
		req.RecordID,
		req.RequestAt.Format(time.RFC3339),
		sdk.PreviewString(req.Reason, infra.AssistantLogContentPreviewLen),
	)
}

func (r *Runner) loadUserState(c infra.AssistantRequestContext) (UserState, error) {
	paths := UserStatePathsFor(r.serviceType, r.botID, c.UserID)
	log.Printf("%s state paths: user=%s meta=%s facts=%s summaries=%s",
		c.LogPrefix, c.UserID, paths.MetadataPath, paths.FactsPath, paths.SummariesPath,
	)
	return LoadUserState(paths)
}

func (r *Runner) applyTiming(meta *memory.Metadata, channelID string, now time.Time) (delta time.Duration, prevRecordID string, newSession bool) {
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
		meta.TimeSinceLastMessage = infra.AssistantTimeSincePrefix + sdk.HumanizeDuration(delta)
	} else {
		meta.TimeSinceLastMessage = infra.AssistantTimeSinceUnknown
	}
	newSession = meta.RecordID == "" || meta.LastMessageAt.IsZero() || delta > infra.AssistantSessionGap
	return delta, prevRecordID, newSession
}

func (r *Runner) tryFinalizePreviousSession(c infra.AssistantRequestContext, s *UserState) {
	if s.Metadata.RecordID == "" || s.Metadata.ChannelID == "" || s.Metadata.LastSummarizedRecordID == s.Metadata.RecordID {
		return
	}
	log.Printf("%s session rollover detected: user=%s prevRecord=%s lastSummarized=%s",
		c.LogPrefix, c.UserID, s.Metadata.RecordID, s.Metadata.LastSummarizedRecordID,
	)
	if err := r.finalizeRecord(c, s); err != nil {
		log.Printf("%s finalize previous record failed (will retry later): %v", c.LogPrefix, err)
	}
}

func (r *Runner) updateSessionState(
	c infra.AssistantRequestContext,
	now, startAt time.Time,
	recordID, prevRecordID string,
	delta time.Duration,
	s *UserState,
) error {
	meta := &s.Metadata
	meta.RecordID = recordID
	meta.StartAt = startAt
	meta.LastMessageAt = now
	meta.ChannelID = c.ChannelID
	startAtLocal := startAt
	if c.TimeLoc != nil && !startAtLocal.IsZero() {
		startAtLocal = startAtLocal.In(c.TimeLoc)
	}
	meta.SessionStartDatetime = startAtLocal.Format(infra.AssistantSessionStartTimeFormat)
	if strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		meta.LastFactRecordID = ""
		meta.LastFactProcessedAt = time.Time{}
	}

	if meta.UserActivityFrequency == "" || strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		if freq, err := r.fetcher.UserActivityFrequency(c.Ctx, c.ChannelID, c.UserID, startAtLocal); err == nil && strings.TrimSpace(freq) != "" {
			meta.UserActivityFrequency = freq
		} else if strings.TrimSpace(meta.UserActivityFrequency) == "" {
			meta.UserActivityFrequency = infra.AssistantDefaultActivity
		}
	}

	baseline := meta.BaselineMood
	lastFinal := meta.FinalMood
	if lastFinal == (memory.Mood{}) {
		lastFinal = baseline
	}
	meta.InitialMood = memory.ComputeInitialMood(baseline, lastFinal, delta)
	return nil
}

func (r *Runner) buildPrompt(
	c infra.AssistantRequestContext,
	s UserState,
	sessionMsgs []sdkapi.ChannelMessage,
) (l1l4 string, l5 []openaigo.ChatCompletionMessageParamUnion) {
	stickerNames := strings.TrimSpace(r.stickers.StickerPromptAddon(c.Mew, c.LogPrefix))
	l1l4 = chat.BuildL1L4UserPrompt(chat.DeveloperInstructionsText(
		infra.AssistantSilenceToken,
		infra.AssistantWantMoreToken,
		infra.AssistantProactiveTokenPrefix,
		infra.AssistantToolCallTokenPrefix,
		infra.AssistantStickerTokenPrefix,
		infra.AssistantVoiceTokenPrefix,
		stickerNames,
		infra.DeveloperInstructionsPromptRelPath,
		infra.DeveloperInstructionsEmbeddedName,
	), s.Metadata, s.Facts, s.Summaries, c.TimeLoc)
	l5, err := chat.BuildL5MessagesWithAttachments(c.Ctx, sessionMsgs, r.botUserID, chat.UserContentPartsOptions{
		DefaultImagePrompt:    infra.DefaultImagePrompt,
		MaxImageBytes:         infra.DefaultMaxImageBytes,
		MaxTotalImageBytes:    infra.DefaultMaxTotalImageBytes,
		KeepEmptyWhenNoImages: true,
		Location:              c.TimeLoc,
		Download: func(ctx context.Context, att sdkapi.AttachmentRef, limit int64) ([]byte, error) {
			httpClient := r.session.HTTPClient()
			return attachment.DownloadAttachmentBytes(ctx, httpClient, httpClient, r.apiBase, "", att, limit)
		},
	})
	if err != nil {
		log.Printf("%s build L5 with attachments failed (fallback to text-only): %v", c.LogPrefix, err)
		l5 = chat.BuildL5Messages(sessionMsgs, r.botUserID, c.TimeLoc)
	}
	log.Printf("%s prompt prepared: L1L4_len=%d L5_msgs=%d facts=%d summaries=%d",
		c.LogPrefix, len(l1l4), len(l5), len(s.Facts.Facts), len(s.Summaries.Summaries),
	)
	return l1l4, l5
}

func (r *Runner) reply(
	c infra.AssistantRequestContext,
	l1l4 string,
	l5 []openaigo.ChatCompletionMessageParamUnion,
	onToolPrelude func(text string) error,
) (reply string, finalMood memory.Mood, gotMood bool, err error) {
	handlers := chat.ToolHandlers{
		HistorySearch: func(ctx context.Context, keyword string) (any, error) {
			return tools.RunHistorySearch(c.History.WithCtx(ctx), c.ChannelID, keyword)
		},
		RecordSearch: func(ctx context.Context, recordID string) (any, error) {
			return tools.RunRecordSearch(c.History.WithCtx(ctx), c.ChannelID, recordID)
		},
		WebSearch: func(ctx context.Context, query string) (any, error) {
			return tools.RunWebSearch(c.LLM.WithCtx(ctx), query)
		},
	}
	opts := chat.ChatWithToolsOptions{
		MaxToolCalls:          infra.AssistantMaxToolCalls,
		HistorySearchToolName: infra.DefaultHistorySearchToolName,
		RecordSearchToolName:  infra.DefaultRecordSearchToolName,
		WebSearchToolName:     infra.DefaultWebSearchToolName,
		LogPrefix:             infra.AssistantLogPrefix,
		ChannelID:             c.ChannelID,
		LLMPreviewLen:         infra.AssistantLogLLMPreviewLen,
		ToolResultPreviewLen:  infra.AssistantLogToolResultPreviewLen,
		OnToolCallAssistantText: func(text string) error {
			if onToolPrelude == nil {
				return nil
			}
			return onToolPrelude(text)
		},
		SilenceToken:           infra.AssistantSilenceToken,
		WantMoreToken:          infra.AssistantWantMoreToken,
		ProactiveTokenPrefix:   infra.AssistantProactiveTokenPrefix,
		StickerTokenPrefix:     infra.AssistantStickerTokenPrefix,
		VoiceTokenPrefix:       infra.AssistantVoiceTokenPrefix,
		MaxLLMRetries:          infra.AssistantMaxLLMRetries,
		LLMRetryInitialBackoff: infra.AssistantLLMRetryInitialBackoff,
		LLMRetryMaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
	}

	var lastReply string
	var lastMood memory.Mood
	var lastGotMood bool
	var lastErr error
	baseL5 := append([]openaigo.ChatCompletionMessageParamUnion(nil), l5...)

	for attempt := 0; attempt < 5; attempt++ {
		msgs := baseL5
		if attempt == 1 {
			msgs = append(append([]openaigo.ChatCompletionMessageParamUnion(nil), baseL5...),
				openaigo.UserMessage("(SYSTEM_INFO: You must reply with NON-EMPTY message content, and final_mood at the end)"),
			)
		}

		out, mood, ok, err := chat.ChatWithTools(c.LLM, c.Persona, l1l4, msgs, handlers, opts)
		lastReply, lastMood, lastGotMood, lastErr = out, mood, ok, err
		if err != nil {
			break
		}
		// Disallow replies that are only final_mood (allow <SILENCE> + final_mood).
		if ok && strings.TrimSpace(out) == "" {
			continue
		}
		return out, mood, ok, nil
	}

	return lastReply, lastMood, lastGotMood, lastErr
}

func (r *Runner) maybeOnDemandRemember(
	c infra.AssistantRequestContext,
	userContent string,
	sessionMsgs []sdkapi.ChannelMessage,
	s *UserState,
	now time.Time,
) {
	if !r.shouldOnDemandRemember(userContent) {
		return
	}

	log.Printf("%s fact engine on-demand: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
	sessionText := chat.FormatSessionRecordForContext(sessionMsgs, c.TimeLoc)
	res, err := memory.ExtractFactsAndUsage(c.LLM, sessionText, s.Facts, infra.CognitiveRetryOptions{
		MaxRetries:     infra.AssistantMaxLLMRetries,
		InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
		LogPrefix:      c.LogPrefix,
		ChannelID:      c.ChannelID,
	})
	if err != nil || (len(res.Facts) == 0 && len(res.UsedFactIDs) == 0) {
		if err != nil {
			log.Printf("%s fact engine on-demand failed: user=%s err=%v", c.LogPrefix, c.UserID, err)
		}
		return
	}

	s.Facts.Facts = memory.TouchFactsByIDs(s.Facts.Facts, res.UsedFactIDs, now)
	s.Facts = memory.UpsertFacts(now, s.Facts, res.Facts, infra.AssistantMaxFacts)
	if err := s.SaveFacts(); err != nil {
		log.Printf("%s save facts failed (on-demand): user=%s err=%v", c.LogPrefix, c.UserID, err)
		return
	}
	log.Printf("%s facts updated (on-demand): user=%s count=%d used=%d new=%d", c.LogPrefix, c.UserID, len(s.Facts.Facts), len(res.UsedFactIDs), len(res.Facts))
}

func (r *Runner) finalizeRecord(c infra.AssistantRequestContext, s *UserState) error {
	now := time.Now()
	meta := &s.Metadata

	msgs, err := r.fetcher.RecordSearch(c.Ctx, meta.ChannelID, meta.RecordID)
	if err != nil {
		return err
	}
	recordText := chat.FormatSessionRecordForContext(msgs, c.TimeLoc)

	if summaryText, err := memory.SummarizeRecord(c.LLM, recordText, infra.CognitiveRetryOptions{
		MaxRetries:     infra.AssistantMaxLLMRetries,
		InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
		LogPrefix:      c.LogPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && strings.TrimSpace(summaryText) != "" {
		s.Summaries = memory.AppendSummary(now, s.Summaries, meta.RecordID, summaryText, infra.AssistantMaxSummaries)
		if err := s.SaveSummaries(); err != nil {
			log.Printf("%s save summaries failed: user=%s record=%s err=%v", c.LogPrefix, c.UserID, meta.RecordID, err)
		}
		meta.LastSummarizedRecordID = meta.RecordID
		if err := s.SaveMetadata(); err != nil {
			log.Printf("%s save metadata failed (after summary): user=%s record=%s err=%v", c.LogPrefix, c.UserID, meta.RecordID, err)
		}
		log.Printf("%s summary saved: user=%s record=%s summaries=%d preview=%q",
			c.LogPrefix, c.UserID, meta.RecordID, len(s.Summaries.Summaries), sdk.PreviewString(summaryText, infra.AssistantLogContentPreviewLen),
		)
	} else if err != nil {
		log.Printf("%s summarize failed: user=%s record=%s err=%v", c.LogPrefix, c.UserID, meta.RecordID, err)
	}

	if res, err := memory.ExtractFactsAndUsage(c.LLM, recordText, s.Facts, infra.CognitiveRetryOptions{
		MaxRetries:     infra.AssistantMaxLLMRetries,
		InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
		LogPrefix:      c.LogPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && (len(res.Facts) > 0 || len(res.UsedFactIDs) > 0) {
		s.Facts.Facts = memory.TouchFactsByIDs(s.Facts.Facts, res.UsedFactIDs, now)
		s.Facts = memory.UpsertFacts(now, s.Facts, res.Facts, infra.AssistantMaxFacts)
		if err := s.SaveFacts(); err != nil {
			log.Printf("%s save facts failed (end-of-session): user=%s record=%s err=%v", c.LogPrefix, c.UserID, meta.RecordID, err)
		}
		log.Printf("%s facts updated (end-of-session): user=%s count=%d used=%d new=%d", c.LogPrefix, c.UserID, len(s.Facts.Facts), len(res.UsedFactIDs), len(res.Facts))
	} else if err != nil {
		log.Printf("%s fact engine end-of-session failed: user=%s err=%v", c.LogPrefix, c.UserID, err)
	}

	log.Printf("%s record finalized: user=%s record=%s", c.LogPrefix, c.UserID, meta.RecordID)
	return nil
}
