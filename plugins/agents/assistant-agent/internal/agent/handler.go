package agent

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/agent/chat"
	"mew/plugins/assistant-agent/internal/agent/memory"
	"mew/plugins/assistant-agent/internal/agent/proactive"
	"mew/plugins/assistant-agent/internal/agent/tools"
	"mew/plugins/assistant-agent/internal/agent/utils"
	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk"
	sdkapi "mew/plugins/sdk/api"
	"mew/plugins/sdk/api/attachment"
	"mew/plugins/sdk/api/gateway/socketio"
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
		sdk.PreviewString(msg.Content, config.AssistantLogContentPreviewLen),
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

func (r *Runner) processDMMessage(
	ctx context.Context,
	logPrefix string,
	socketMsg sdkapi.ChannelMessage,
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
		logPrefix, channelID, recordID, startAt.Format(time.RFC3339), len(sessionMsgs), sdk.PreviewString(r.persona, config.AssistantLogPersonaPreviewLen),
	)

	if err := r.updateSessionState(ctx, userID, channelID, now, startAt, recordID, prevRecordID, delta, &meta); err != nil {
		return err
	}
	if err := SaveMetadata(paths.MetadataPath, meta); err != nil {
		return err
	}

	l1l4, l5 := r.buildPrompt(ctx, meta, facts, summaries, sessionMsgs, logPrefix)
	reply, finalMood, gotMood, err := r.reply(ctx, emit, channelID, userID, l1l4, l5, logPrefix)
	if err != nil {
		return err
	}

	if gotMood {
		meta.FinalMood = finalMood
		if err := SaveMetadata(paths.MetadataPath, meta); err != nil {
			return err
		}
	}

	clean, controls := chat.ParseReplyControls(reply)
	if err := chat.SendReply(ctx, emit, channelID, userID, clean, config.AssistantTypingWPMDefault, controls, logPrefix,
		func(ctx context.Context, channelID, content string) error {
			return chat.PostMessageHTTP(ctx, r.session.HTTPClient(), r.apiBase, channelID, content)
		},
		func(ctx context.Context, channelID, stickerID string) error {
			return chat.PostStickerHTTP(ctx, r.session.HTTPClient(), r.apiBase, channelID, stickerID)
		},
		func(ctx context.Context, name string) (string, error) {
			return r.stickers.ResolveStickerIDByName(ctx, r.session.HTTPClient(), r.apiBase, logPrefix, name)
		},
	); err != nil {
		return err
	}
	r.enqueueProactive(now, paths, channelID, recordID, controls.Proactive, logPrefix)

	// If the model explicitly asks for a continuation, prompt it once more.
	if controls.WantMore {
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
			if err := SaveMetadata(paths.MetadataPath, meta); err != nil {
				return err
			}
		}

		moreClean, moreControls := chat.ParseReplyControls(more)
		if err := chat.SendReply(ctx, emit, channelID, userID, moreClean, config.AssistantTypingWPMDefault, moreControls, logPrefix,
			func(ctx context.Context, channelID, content string) error {
				return chat.PostMessageHTTP(ctx, r.session.HTTPClient(), r.apiBase, channelID, content)
			},
			func(ctx context.Context, channelID, stickerID string) error {
				return chat.PostStickerHTTP(ctx, r.session.HTTPClient(), r.apiBase, channelID, stickerID)
			},
			func(ctx context.Context, name string) (string, error) {
				return r.stickers.ResolveStickerIDByName(ctx, r.session.HTTPClient(), r.apiBase, logPrefix, name)
			},
		); err != nil {
			return err
		}
		r.enqueueProactive(now, paths, channelID, recordID, moreControls.Proactive, logPrefix)
	}
	r.maybeOnDemandRemember(ctx, socketMsg.Content, sessionMsgs, facts, paths, userID, channelID, now, logPrefix)
	return nil
}

func (r *Runner) enqueueProactive(now time.Time, paths UserStatePaths, channelID string, recordID string, d *chat.ProactiveDirective, logPrefix string) {
	req, ok := proactive.BuildProactiveRequest(now, channelID, recordID, d)
	if !ok {
		return
	}

	q, err := LoadProactiveQueue(paths.ProactivePath)
	if err != nil {
		log.Printf("%s load proactive queue failed: path=%s err=%v", logPrefix, paths.ProactivePath, err)
		return
	}
	q = proactive.AppendProactiveRequest(now, q, req, config.AssistantMaxProactiveQueue)
	if err := SaveProactiveQueue(paths.ProactivePath, q); err != nil {
		log.Printf("%s save proactive queue failed: path=%s err=%v", logPrefix, paths.ProactivePath, err)
		return
	}

	log.Printf("%s proactive queued: channel=%s record=%s at=%s reason=%q",
		logPrefix,
		req.ChannelID,
		req.RecordID,
		req.RequestAt.Format(time.RFC3339),
		sdk.PreviewString(req.Reason, config.AssistantLogContentPreviewLen),
	)
}

func (r *Runner) loadUserState(userID, logPrefix string) (paths UserStatePaths, facts memory.FactsFile, summaries memory.SummariesFile, meta memory.Metadata, err error) {
	paths = UserStatePathsFor(r.serviceType, r.botID, userID)
	log.Printf("%s state paths: user=%s meta=%s facts=%s summaries=%s",
		logPrefix, userID, paths.MetadataPath, paths.FactsPath, paths.SummariesPath,
	)
	facts, err = LoadFacts(paths.FactsPath)
	if err != nil {
		return UserStatePaths{}, memory.FactsFile{}, memory.SummariesFile{}, memory.Metadata{}, err
	}
	summaries, err = LoadSummaries(paths.SummariesPath)
	if err != nil {
		return UserStatePaths{}, memory.FactsFile{}, memory.SummariesFile{}, memory.Metadata{}, err
	}
	meta, err = LoadMetadata(paths.MetadataPath)
	if err != nil {
		return UserStatePaths{}, memory.FactsFile{}, memory.SummariesFile{}, memory.Metadata{}, err
	}
	return paths, facts, summaries, meta, nil
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
		meta.TimeSinceLastMessage = config.AssistantTimeSincePrefix + sdk.HumanizeDuration(delta)
	} else {
		meta.TimeSinceLastMessage = config.AssistantTimeSinceUnknown
	}
	newSession = meta.RecordID == "" || meta.LastMessageAt.IsZero() || delta > config.AssistantSessionGap
	return delta, prevRecordID, newSession
}

func (r *Runner) tryFinalizePreviousSession(ctx context.Context, logPrefix, userID string, paths UserStatePaths, meta *memory.Metadata) {
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
	meta *memory.Metadata,
) error {
	meta.RecordID = recordID
	meta.StartAt = startAt
	meta.LastMessageAt = now
	meta.ChannelID = channelID
	startAtLocal := startAt
	if r.timeLoc != nil && !startAtLocal.IsZero() {
		startAtLocal = startAtLocal.In(r.timeLoc)
	}
	meta.SessionStartDatetime = startAtLocal.Format(config.AssistantSessionStartTimeFormat)
	if strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		meta.LastFactRecordID = ""
		meta.LastFactProcessedAt = time.Time{}
	}

	if meta.UserActivityFrequency == "" || strings.TrimSpace(prevRecordID) != strings.TrimSpace(recordID) {
		if freq, err := r.fetcher.UserActivityFrequency(ctx, channelID, userID, startAtLocal); err == nil && strings.TrimSpace(freq) != "" {
			meta.UserActivityFrequency = freq
		} else if strings.TrimSpace(meta.UserActivityFrequency) == "" {
			meta.UserActivityFrequency = config.AssistantDefaultActivity
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
	ctx context.Context,
	meta memory.Metadata,
	facts memory.FactsFile,
	summaries memory.SummariesFile,
	sessionMsgs []sdkapi.ChannelMessage,
	logPrefix string,
) (l1l4 string, l5 []openaigo.ChatCompletionMessageParamUnion) {
	stickerNames := strings.TrimSpace(r.stickers.StickerPromptAddon(ctx, r.session.HTTPClient(), r.apiBase, logPrefix))
	l1l4 = chat.BuildL1L4UserPrompt(chat.DeveloperInstructionsText(
		config.AssistantSilenceToken,
		config.AssistantWantMoreToken,
		config.AssistantProactiveTokenPrefix,
		config.AssistantToolCallTokenPrefix,
		config.AssistantStickerTokenPrefix,
		stickerNames,
		config.DeveloperInstructionsPromptRelPath,
		config.DeveloperInstructionsEmbeddedName,
	), meta, facts, summaries, r.timeLoc)
	l5, err := chat.BuildL5MessagesWithAttachments(ctx, sessionMsgs, r.botUserID, chat.UserContentPartsOptions{
		DefaultImagePrompt:    config.DefaultImagePrompt,
		MaxImageBytes:         config.DefaultMaxImageBytes,
		MaxTotalImageBytes:    config.DefaultMaxTotalImageBytes,
		KeepEmptyWhenNoImages: true,
		Location:              r.timeLoc,
		Download: func(ctx context.Context, att sdkapi.AttachmentRef, limit int64) ([]byte, error) {
			httpClient := r.session.HTTPClient()
			return attachment.DownloadAttachmentBytes(ctx, httpClient, httpClient, r.apiBase, "", att, limit)
		},
	})
	if err != nil {
		log.Printf("%s build L5 with attachments failed (fallback to text-only): %v", logPrefix, err)
		l5 = chat.BuildL5Messages(sessionMsgs, r.botUserID, r.timeLoc)
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
) (reply string, finalMood memory.Mood, gotMood bool, err error) {
	return chat.ChatWithTools(ctx, r.llmHTTPClient, r.aiConfig, strings.TrimSpace(r.persona), l1l4, l5, chat.ToolHandlers{
		HistorySearch: func(ctx context.Context, keyword string) (any, error) {
			return tools.RunHistorySearch(ctx, r.fetcher, channelID, keyword, r.timeLoc)
		},
		RecordSearch: func(ctx context.Context, recordID string) (any, error) {
			return tools.RunRecordSearch(ctx, r.fetcher, channelID, recordID, r.timeLoc)
		},
		WebSearch: func(ctx context.Context, query string) (any, error) {
			return tools.RunWebSearch(ctx, r.llmHTTPClient, r.aiConfig, query)
		},
	}, chat.ChatWithToolsOptions{
		MaxToolCalls:          config.AssistantMaxToolCalls,
		HistorySearchToolName: config.DefaultHistorySearchToolName,
		RecordSearchToolName:  config.DefaultRecordSearchToolName,
		WebSearchToolName:     config.DefaultWebSearchToolName,
		LogPrefix:             config.AssistantLogPrefix,
		ChannelID:             channelID,
		LLMPreviewLen:         config.AssistantLogLLMPreviewLen,
		ToolResultPreviewLen:  config.AssistantLogToolResultPreviewLen,
		OnToolCallAssistantText: func(text string) error {
			return chat.SendToolPrelude(ctx, emit, channelID, userID, text, logPrefix, func(ctx context.Context, channelID, content string) error {
				return chat.PostMessageHTTP(ctx, r.session.HTTPClient(), r.apiBase, channelID, content)
			})
		},
		SilenceToken:           config.AssistantSilenceToken,
		WantMoreToken:          config.AssistantWantMoreToken,
		ProactiveTokenPrefix:   config.AssistantProactiveTokenPrefix,
		StickerTokenPrefix:     config.AssistantStickerTokenPrefix,
		MaxLLMRetries:          config.AssistantMaxLLMRetries,
		LLMRetryInitialBackoff: config.AssistantLLMRetryInitialBackoff,
		LLMRetryMaxBackoff:     config.AssistantLLMRetryMaxBackoff,
	})
}

func (r *Runner) maybeOnDemandRemember(
	ctx context.Context,
	userContent string,
	sessionMsgs []sdkapi.ChannelMessage,
	facts memory.FactsFile,
	paths UserStatePaths,
	userID, channelID string,
	now time.Time,
	logPrefix string,
) {
	if !r.shouldOnDemandRemember(userContent) {
		return
	}

	log.Printf("%s fact engine on-demand: channel=%s user=%s", logPrefix, channelID, userID)
	sessionText := chat.FormatSessionRecordForContext(sessionMsgs, r.timeLoc)
	res, err := memory.ExtractFactsAndUsageWithRetry(ctx, r.llmHTTPClient, r.aiConfig, sessionText, facts, utils.CognitiveRetryOptions{
		MaxRetries:     config.AssistantMaxLLMRetries,
		InitialBackoff: config.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      channelID,
	})
	if err != nil || (len(res.Facts) == 0 && len(res.UsedFactIDs) == 0) {
		if err != nil {
			log.Printf("%s fact engine on-demand failed: user=%s err=%v", logPrefix, userID, err)
		}
		return
	}

	facts.Facts = memory.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
	facts = memory.UpsertFacts(now, facts, res.Facts, config.AssistantMaxFacts)
	_ = SaveFacts(paths.FactsPath, facts)
	log.Printf("%s facts updated (on-demand): user=%s count=%d used=%d new=%d", logPrefix, userID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
}

func (r *Runner) finalizeRecord(ctx context.Context, logPrefix, userID string, paths UserStatePaths, meta *memory.Metadata) error {
	now := time.Now()

	facts, err := LoadFacts(paths.FactsPath)
	if err != nil {
		return err
	}
	summaries, err := LoadSummaries(paths.SummariesPath)
	if err != nil {
		return err
	}

	msgs, err := r.fetcher.RecordSearch(ctx, meta.ChannelID, meta.RecordID)
	if err != nil {
		return err
	}
	recordText := chat.FormatSessionRecordForContext(msgs, r.timeLoc)

	if summaryText, err := memory.SummarizeRecordWithRetry(ctx, r.llmHTTPClient, r.aiConfig, recordText, utils.CognitiveRetryOptions{
		MaxRetries:     config.AssistantMaxLLMRetries,
		InitialBackoff: config.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && strings.TrimSpace(summaryText) != "" {
		summaries = memory.AppendSummary(now, summaries, meta.RecordID, summaryText, config.AssistantMaxSummaries)
		_ = SaveSummaries(paths.SummariesPath, summaries)
		meta.LastSummarizedRecordID = meta.RecordID
		_ = SaveMetadata(paths.MetadataPath, *meta)
		log.Printf("%s summary saved: user=%s record=%s summaries=%d preview=%q",
			logPrefix, userID, meta.RecordID, len(summaries.Summaries), sdk.PreviewString(summaryText, config.AssistantLogContentPreviewLen),
		)
	} else if err != nil {
		log.Printf("%s summarize failed: user=%s record=%s err=%v", logPrefix, userID, meta.RecordID, err)
	}

	if res, err := memory.ExtractFactsAndUsageWithRetry(ctx, r.llmHTTPClient, r.aiConfig, recordText, facts, utils.CognitiveRetryOptions{
		MaxRetries:     config.AssistantMaxLLMRetries,
		InitialBackoff: config.AssistantLLMRetryInitialBackoff,
		MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
		LogPrefix:      logPrefix,
		ChannelID:      meta.ChannelID,
	}); err == nil && (len(res.Facts) > 0 || len(res.UsedFactIDs) > 0) {
		facts.Facts = memory.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
		facts = memory.UpsertFacts(now, facts, res.Facts, config.AssistantMaxFacts)
		_ = SaveFacts(paths.FactsPath, facts)
		log.Printf("%s facts updated (end-of-session): user=%s count=%d used=%d new=%d", logPrefix, userID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
	} else if err != nil {
		log.Printf("%s fact engine end-of-session failed: user=%s err=%v", logPrefix, userID, err)
	}

	log.Printf("%s record finalized: user=%s record=%s", logPrefix, userID, meta.RecordID)
	return nil
}
