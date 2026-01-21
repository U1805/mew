package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mew/plugins/internal/agents/assistant-agent/chat"
	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/internal/agents/assistant-agent/proactive"
	"mew/plugins/internal/agents/assistant-agent/tools"
	"mew/plugins/pkg"
	"mew/plugins/pkg/api/gateway/socketio"
	"mew/plugins/pkg/api/history"
	"mew/plugins/pkg/api/messages"
)

type Runner struct {
	serviceType string
	botID       string
	botName     string
	accessToken string
	botUserID   string
	session     *sdk.BotSession

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	llmHTTPClient *http.Client

	aiConfig infra.AssistantConfig
	timeLoc  *time.Location
	persona  string

	dmChannels *sdk.DMChannelCache
	fetcher    *history.Fetcher

	userMu   sync.Mutex
	userLock map[string]*sync.Mutex

	knownUsersMu sync.RWMutex
	knownUsers   map[string]struct{}

	stickers *tools.StickerService

	conversations *conversationManager
}

type conversationManager struct {
	r *Runner

	mu    sync.Mutex
	convs map[chat.ConversationKey]*chat.ConversationCoordinator
}

func newConversationManager(r *Runner) *conversationManager {
	return &conversationManager{
		r:     r,
		convs: map[chat.ConversationKey]*chat.ConversationCoordinator{},
	}
}

func (m *conversationManager) get(channelID, userID string) *chat.ConversationCoordinator {
	k := chat.ConversationKey{
		ChannelID: strings.TrimSpace(channelID),
		UserID:    strings.TrimSpace(userID),
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.convs[k]; ok {
		return c
	}
	c := chat.NewConversationCoordinator(k)
	m.convs[k] = c
	return c
}

func (r *Runner) buildChatTransport(c infra.AssistantRequestContext, emit socketio.EmitFunc) chat.TransportContext {
	return chat.TransportContext{
		Emit:      emit,
		ChannelID: c.ChannelID,
		UserID:    c.UserID,
		LogPrefix: c.LogPrefix,
		TypingWPM: infra.AssistantTypingWPMDefault,
		PostMessageHTTP: func(ctx context.Context, channelID, content string) error {
			return chat.PostMessageHTTP(c.Mew.WithCtx(ctx), channelID, content)
		},
		PostStickerHTTP: func(ctx context.Context, channelID, stickerID string) error {
			return chat.PostStickerHTTP(c.Mew.WithCtx(ctx), channelID, stickerID)
		},
		SendVoiceHTTP: func(ctx context.Context, channelID, text string) error {
			return r.sendVoiceHTTP(c, ctx, channelID, text)
		},
		ResolveStickerIDByName: func(ctx context.Context, name string) (string, error) {
			return r.stickers.ResolveStickerIDByName(c.Mew.WithCtx(ctx), c.LogPrefix, name)
		},
	}
}

func (r *Runner) sendVoiceHTTP(c infra.AssistantRequestContext, ctx context.Context, channelID, text string) error {
	audioURL, err := tools.RunHobbyistTTS(c.LLM.WithCtx(ctx), text)
	if err != nil {
		return err
	}

	downloadClient := c.LLM.HTTPClient
	if downloadClient == nil {
		downloadClient = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, audioURL, nil)
	if err != nil {
		return err
	}
	resp, err := downloadClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("tts audio download status=%d", resp.StatusCode)
	}

	filename := "voice.wav"
	if u, err := url.Parse(audioURL); err == nil && u != nil {
		if b := strings.TrimSpace(path.Base(u.Path)); b != "" && b != "." && b != "/" {
			filename = b
		}
	}
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "audio/wav"
	}

	tmpPattern := "mew-tts-*"
	if ext := strings.TrimSpace(path.Ext(filename)); ext != "" {
		tmpPattern = "mew-tts-*" + ext
	}
	tmp, err := os.CreateTemp("", tmpPattern)
	if err != nil {
		return err
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
	}()
	if _, err := io.Copy(tmp, resp.Body); err != nil {
		return err
	}
	if _, err := tmp.Seek(0, 0); err != nil {
		return err
	}

	uploadClient := c.Mew.HTTPClient
	if uploadClient == nil {
		uploadClient = http.DefaultClient
	}
	uploadClient30s := uploadClient
	if uploadClient.Timeout != 30*time.Second {
		cloned := *uploadClient
		cloned.Timeout = 30 * time.Second
		uploadClient30s = &cloned
	}

	_, err = messages.SendVoiceMessageByUploadReader(
		ctx,
		uploadClient30s,
		c.Mew.APIBase,
		"",
		channelID,
		filename,
		contentType,
		tmp,
		messages.SendVoiceMessageOptions{PlainText: text},
	)
	return err
}

type RunnerOptions struct {
	ServiceType string
	BotID       string
	BotName     string
	AccessToken string
	RawConfig   string
	Runtime     sdk.RuntimeConfig
}

func NewAssistantRunner(opts RunnerOptions) (*Runner, error) {
	mewURL := sdk.MewURLFromEnvOrAPIBase(opts.Runtime.APIBase, infra.AssistantDefaultMewURL)
	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmCfg, err := infra.ParseAssistantConfig(opts.RawConfig)
	if err != nil {
		return nil, err
	}
	timeLoc, err := llmCfg.TimeLocation()
	if err != nil {
		return nil, err
	}

	persona, err := chat.ReadPromptWithOverrides(infra.PersonaPromptRelPath, infra.PersonaPromptEmbeddedName)
	if err != nil {
		return nil, fmt.Errorf("read persona failed: %w", err)
	}
	userInterests := strings.TrimSpace(llmCfg.User.UserInterests)
	if userInterests == "" {
		userInterests = "(未配置)"
	}
	persona = strings.ReplaceAll(persona, "{{USER_INTERESTS}}", userInterests)

	llmTransport := http.DefaultTransport.(*http.Transport).Clone()
	llmTransport.Proxy = nil
	llmHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     75 * time.Second,
		UseMEWProxy: true,
		Transport:   llmTransport,
	})

	r := &Runner{
		serviceType:   opts.ServiceType,
		botID:         opts.BotID,
		botName:       opts.BotName,
		accessToken:   opts.AccessToken,
		botUserID:     "",
		session:       nil,
		apiBase:       strings.TrimRight(opts.Runtime.APIBase, "/"),
		mewURL:        mewURL,
		wsURL:         wsURL,
		mewHTTPClient: mewHTTPClient,
		llmHTTPClient: llmHTTPClient,
		aiConfig:      llmCfg,
		timeLoc:       timeLoc,
		persona:       persona,
		dmChannels:    sdk.NewDMChannelCache(),
		stickers:      tools.NewStickerService(),
		fetcher: &history.Fetcher{
			HTTPClient:         mewHTTPClient,
			APIBase:            strings.TrimRight(opts.Runtime.APIBase, "/"),
			UserToken:          "",
			PageSize:           infra.AssistantFetchPageSize,
			MaxPages:           infra.AssistantMaxFetchPages,
			SessionGap:         infra.AssistantSessionGap,
			MaxSessionMessages: infra.AssistantMaxSessionMessages,
		},
		userLock:   map[string]*sync.Mutex{},
		knownUsers: map[string]struct{}{},
	}
	r.conversations = newConversationManager(r)
	return r, nil
}

func (r *Runner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("%s bot=%s name=%q", infra.AssistantLogPrefix, r.botID, r.botName)

	r.session = sdk.NewBotSession(r.apiBase, r.accessToken, r.mewHTTPClient)
	me, err := r.session.User(ctx)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	if authed := r.session.HTTPClient(); authed != nil {
		r.fetcher.HTTPClient = authed
	}
	r.fetcher.UserToken = ""

	r.loadKnownUsersFromDisk(logPrefix)

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	type messageCreateJob struct {
		payload json.RawMessage
		emit    socketio.EmitFunc
	}
	jobs := make(chan messageCreateJob, infra.AssistantIncomingQueueSize)

	g := sdk.NewGroup(ctx)
	for i := 0; i < infra.AssistantWorkerCount; i++ {
		workerID := i + 1
		g.Go(func(ctx context.Context) {
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-jobs:
					if len(job.payload) == 0 || job.emit == nil {
						continue
					}
					if err := r.handleMessageCreate(ctx, logPrefix, job.payload, job.emit); err != nil {
						log.Printf("%s event handler error: worker=%d err=%v", logPrefix, workerID, err)
					}
				}
			}
		})
	}
	g.Go(func(ctx context.Context) {
		sdk.RunInterval(ctx, 5*time.Minute, true, func(ctx context.Context) {
			r.runPeriodicFactEngine(ctx, logPrefix)
			r.finalizeStaleSessions(ctx, logPrefix)
		})
	})
	g.Go(func(ctx context.Context) {
		sdk.RunInterval(ctx, 10*time.Second, true, func(ctx context.Context) {
			r.runProactiveQueue(ctx, logPrefix)
		})
	})
	g.Go(func(ctx context.Context) {
		err := socketio.RunGatewayWithReconnectSession(ctx, r.wsURL, r.session, func(ctx context.Context, eventName string, payload json.RawMessage, emit socketio.EmitFunc) error {
			if eventName != infra.AssistantEventMessageCreate {
				return nil
			}
			if len(payload) == 0 {
				return nil
			}

			// Important: do not block the gateway read loop with long-running work (LLM calls, history fetch),
			// otherwise ping/pong frames cannot be processed in time and the server may disconnect the socket.
			select {
			case jobs <- messageCreateJob{payload: payload, emit: emit}:
			default:
				log.Printf("%s incoming queue full, drop MESSAGE_CREATE: size=%d", logPrefix, infra.AssistantIncomingQueueSize)
			}
			return nil
		}, socketio.GatewayOptions{}, socketio.ReconnectOptions{
			InitialBackoff: 500 * time.Millisecond,
			MaxBackoff:     10 * time.Second,
			OnDisconnect: func(err error, nextBackoff time.Duration) {
				log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, nextBackoff)
			},
		})
		if err != nil && ctx.Err() == nil {
			log.Printf("%s gateway stopped: %v", logPrefix, err)
		}
	})
	g.Wait()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return nil
}

func (r *Runner) newRequestContext(ctx context.Context, userID, channelID, logPrefix string) infra.AssistantRequestContext {
	return infra.AssistantRequestContext{
		Ctx:       ctx,
		UserID:    userID,
		ChannelID: channelID,
		LogPrefix: logPrefix,
		TimeLoc:   r.timeLoc,
		Persona:   strings.TrimSpace(r.persona),
		LLM: infra.LLMCallContext{
			Ctx:        ctx,
			HTTPClient: r.llmHTTPClient,
			Config:     r.aiConfig,
		},
		Mew: infra.MewCallContext{
			Ctx:        ctx,
			HTTPClient: r.session.HTTPClient(),
			APIBase:    r.apiBase,
		},
		History: infra.HistoryCallContext{
			Ctx:     ctx,
			Fetcher: r.fetcher,
			TimeLoc: r.timeLoc,
		},
	}
}

func (r *Runner) runPeriodicFactEngine(ctx context.Context, logPrefix string) {
	r.knownUsersMu.RLock()
	users := make([]string, 0, len(r.knownUsers))
	for id := range r.knownUsers {
		users = append(users, id)
	}
	r.knownUsersMu.RUnlock()

	now := time.Now()
	for _, userID := range users {
		lock := r.userMutex(userID)
		lock.Lock()
		func() {
			defer lock.Unlock()
			userCtx := r.newRequestContext(ctx, userID, "", logPrefix)
			paths := UserStatePathsFor(r.serviceType, r.botID, userID)
			facts, err := LoadFacts(paths.FactsPath)
			if err != nil {
				log.Printf("%s load facts failed (periodic): user=%s err=%v", logPrefix, userID, err)
				return
			}

			// 记忆整理属于“梦境固化”式的后台工作，不应依赖会话状态。
			// 它对每个用户最多每天执行一次，并持久化在 facts.json 中（LastConsolidatedAt）。
			if updated, ran, err := memory.MaybeConsolidateFacts(userCtx.LLM, now, facts, infra.AssistantMaxFacts, infra.CognitiveRetryOptions{
				MaxRetries:     infra.AssistantMaxLLMRetries,
				InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
				MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
				LogPrefix:      logPrefix,
				ChannelID:      "",
			}); err != nil {
				log.Printf("%s facts consolidation failed (periodic): user=%s err=%v", logPrefix, userID, err)
			} else if ran {
				facts = updated
				_ = SaveFacts(paths.FactsPath, facts)
			}

			meta, err := LoadMetadata(paths.MetadataPath)
			if err != nil {
				log.Printf("%s load metadata failed (periodic): user=%s err=%v", logPrefix, userID, err)
				return
			}
			if meta.RecordID == "" || meta.ChannelID == "" {
				return
			}
			if meta.LastMessageAt.IsZero() {
				return
			}
			if now.Sub(meta.LastMessageAt) > infra.AssistantSessionGap {
				return
			}
			if strings.TrimSpace(meta.LastFactRecordID) == strings.TrimSpace(meta.RecordID) && !meta.LastFactProcessedAt.IsZero() && !meta.LastMessageAt.After(meta.LastFactProcessedAt) {
				return
			}

			sessionCtx := userCtx
			sessionCtx.ChannelID = meta.ChannelID
			sessionMsgs, recordID, _, err := r.fetcher.FetchSessionMessages(sessionCtx.Ctx, meta.ChannelID)
			if err != nil {
				log.Printf("%s load session record failed (periodic): user=%s channel=%s err=%v", logPrefix, userID, meta.ChannelID, err)
				return
			}
			if strings.TrimSpace(recordID) != strings.TrimSpace(meta.RecordID) {
				return
			}

			sessionText := chat.FormatSessionRecordForContext(sessionMsgs, sessionCtx.TimeLoc)
			res, err := memory.ExtractFactsAndUsage(sessionCtx.LLM, sessionText, facts, infra.CognitiveRetryOptions{
				MaxRetries:     infra.AssistantMaxLLMRetries,
				InitialBackoff: infra.AssistantLLMRetryInitialBackoff,
				MaxBackoff:     infra.AssistantLLMRetryMaxBackoff,
				LogPrefix:      logPrefix,
				ChannelID:      meta.ChannelID,
			})
			if err != nil {
				log.Printf("%s fact engine periodic failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if len(res.Facts) > 0 || len(res.UsedFactIDs) > 0 {
				facts.Facts = memory.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
				facts = memory.UpsertFacts(now, facts, res.Facts, infra.AssistantMaxFacts)
				_ = SaveFacts(paths.FactsPath, facts)
				log.Printf("%s facts updated (periodic): user=%s record=%s count=%d used=%d new=%d", logPrefix, userID, meta.RecordID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
			}

			meta.LastFactRecordID = meta.RecordID
			meta.LastFactProcessedAt = meta.LastMessageAt
			_ = SaveMetadata(paths.MetadataPath, meta)
		}()
	}
}

func (r *Runner) finalizeStaleSessions(ctx context.Context, logPrefix string) {
	r.knownUsersMu.RLock()
	users := make([]string, 0, len(r.knownUsers))
	for id := range r.knownUsers {
		users = append(users, id)
	}
	r.knownUsersMu.RUnlock()

	now := time.Now()
	for _, userID := range users {
		lock := r.userMutex(userID)
		lock.Lock()
		func() {
			defer lock.Unlock()
			paths := UserStatePathsFor(r.serviceType, r.botID, userID)
			meta, err := LoadMetadata(paths.MetadataPath)
			if err != nil {
				log.Printf("%s load metadata failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if meta.RecordID == "" || meta.ChannelID == "" {
				return
			}
			if meta.LastMessageAt.IsZero() {
				return
			}
			if now.Sub(meta.LastMessageAt) <= infra.AssistantSessionGap {
				return
			}
			if meta.LastSummarizedRecordID == meta.RecordID {
				return
			}
			c := r.newRequestContext(ctx, userID, meta.ChannelID, logPrefix)
			state, err := r.loadUserState(c)
			if err != nil {
				log.Printf("%s load user state failed (finalize): user=%s err=%v", logPrefix, userID, err)
				return
			}
			if err := r.finalizeRecord(c, &state); err != nil {
				log.Printf("%s finalize record failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
		}()
	}
}

func (r *Runner) runProactiveQueue(ctx context.Context, logPrefix string) {
	r.knownUsersMu.RLock()
	users := make([]string, 0, len(r.knownUsers))
	for id := range r.knownUsers {
		users = append(users, id)
	}
	r.knownUsersMu.RUnlock()

	for _, userID := range users {
		lock := r.userMutex(userID)
		lock.Lock()
		func() {
			defer lock.Unlock()
			paths := UserStatePathsFor(r.serviceType, r.botID, userID)

			q, err := LoadProactiveQueue(paths.ProactivePath)
			if err != nil {
				log.Printf("%s load proactive queue failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if len(q.Requests) == 0 {
				return
			}

			hasDue := false
			now := time.Now()
			for _, req := range q.Requests {
				if !req.RequestAt.After(now) {
					hasDue = true
					break
				}
			}
			if !hasDue {
				return
			}

			meta, err := LoadMetadata(paths.MetadataPath)
			if err != nil {
				log.Printf("%s load metadata failed (proactive): user=%s err=%v", logPrefix, userID, err)
				return
			}

			var summaries memory.SummariesFile
			if s, err := LoadSummaries(paths.SummariesPath); err == nil {
				summaries = s
			}

			q = proactive.RunProactiveQueueForUser(r.newRequestContext(ctx, userID, "", logPrefix), q, meta, summaries)

			if err := SaveProactiveQueue(paths.ProactivePath, q); err != nil {
				log.Printf("%s save proactive queue failed: user=%s err=%v", logPrefix, userID, err)
			}
		}()
	}
}

func (r *Runner) refreshDMChannels(ctx context.Context) error {
	return r.dmChannels.RefreshWithBotSession(ctx, r.session)
}

func (r *Runner) userMutex(userID string) *sync.Mutex {
	r.userMu.Lock()
	defer r.userMu.Unlock()
	if mu, ok := r.userLock[userID]; ok {
		return mu
	}
	mu := &sync.Mutex{}
	r.userLock[userID] = mu
	return mu
}

func (r *Runner) loadKnownUsersFromDisk(logPrefix string) {
	usersDir := filepath.Join(sdk.BotStateDir(r.serviceType, r.botID), "users")
	ents, err := os.ReadDir(usersDir)
	if err != nil {
		return
	}

	r.knownUsersMu.Lock()
	defer r.knownUsersMu.Unlock()
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		id := strings.TrimSpace(e.Name())
		if id == "" {
			continue
		}
		r.knownUsers[id] = struct{}{}
	}
	log.Printf("%s loaded known users from disk: dir=%s count=%d", logPrefix, usersDir, len(r.knownUsers))
}
