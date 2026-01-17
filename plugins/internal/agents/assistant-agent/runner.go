package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mew/plugins/internal/agents/assistant-agent/agentctx"
	"mew/plugins/internal/agents/assistant-agent/chat"
	"mew/plugins/internal/agents/assistant-agent/config"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/internal/agents/assistant-agent/proactive"
	"mew/plugins/internal/agents/assistant-agent/tools"
	"mew/plugins/internal/agents/assistant-agent/utils"
	"mew/plugins/pkg"
	"mew/plugins/pkg/api/gateway/socketio"
	"mew/plugins/pkg/api/history"
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

	aiConfig config.AssistantConfig
	timeLoc  *time.Location
	persona  string

	dmChannels *sdk.DMChannelCache
	fetcher    *history.Fetcher

	userMu   sync.Mutex
	userLock map[string]*sync.Mutex

	knownUsersMu sync.RWMutex
	knownUsers   map[string]struct{}

	stickers *tools.StickerService
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
	mewURL := sdk.MewURLFromEnvOrAPIBase(opts.Runtime.APIBase, config.AssistantDefaultMewURL)
	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmCfg, err := config.ParseAssistantConfig(opts.RawConfig)
	if err != nil {
		return nil, err
	}
	timeLoc, err := llmCfg.TimeLocation()
	if err != nil {
		return nil, err
	}

	persona, err := chat.ReadPromptWithOverrides(config.PersonaPromptRelPath, config.PersonaPromptEmbeddedName)
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
			PageSize:           config.AssistantFetchPageSize,
			MaxPages:           config.AssistantMaxFetchPages,
			SessionGap:         config.AssistantSessionGap,
			MaxSessionMessages: config.AssistantMaxSessionMessages,
		},
		userLock:   map[string]*sync.Mutex{},
		knownUsers: map[string]struct{}{},
	}
	return r, nil
}

func (r *Runner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("%s bot=%s name=%q", config.AssistantLogPrefix, r.botID, r.botName)

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
	jobs := make(chan messageCreateJob, config.AssistantIncomingQueueSize)

	g := sdk.NewGroup(ctx)
	for i := 0; i < config.AssistantWorkerCount; i++ {
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
			if eventName != config.AssistantEventMessageCreate {
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
				log.Printf("%s incoming queue full, drop MESSAGE_CREATE: size=%d", logPrefix, config.AssistantIncomingQueueSize)
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
			paths := UserStatePathsFor(r.serviceType, r.botID, userID)
			facts, err := LoadFacts(paths.FactsPath)
			if err != nil {
				log.Printf("%s load facts failed (periodic): user=%s err=%v", logPrefix, userID, err)
				return
			}

			// 记忆整理属于“梦境固化”式的后台工作，不应依赖会话状态。
			// 它对每个用户最多每天执行一次，并持久化在 facts.json 中（LastConsolidatedAt）。
			if updated, ran, err := memory.MaybeConsolidateFacts(agentctx.LLMCallContext{Ctx: ctx, HTTPClient: r.llmHTTPClient, Config: r.aiConfig}, now, facts, config.AssistantMaxFacts, utils.CognitiveRetryOptions{
				MaxRetries:     config.AssistantMaxLLMRetries,
				InitialBackoff: config.AssistantLLMRetryInitialBackoff,
				MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
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
			if now.Sub(meta.LastMessageAt) > config.AssistantSessionGap {
				return
			}
			if strings.TrimSpace(meta.LastFactRecordID) == strings.TrimSpace(meta.RecordID) && !meta.LastFactProcessedAt.IsZero() && !meta.LastMessageAt.After(meta.LastFactProcessedAt) {
				return
			}

			sessionMsgs, recordID, _, err := r.fetcher.FetchSessionMessages(ctx, meta.ChannelID)
			if err != nil {
				log.Printf("%s load session record failed (periodic): user=%s channel=%s err=%v", logPrefix, userID, meta.ChannelID, err)
				return
			}
			if strings.TrimSpace(recordID) != strings.TrimSpace(meta.RecordID) {
				return
			}

			sessionText := chat.FormatSessionRecordForContext(sessionMsgs, r.timeLoc)
			res, err := memory.ExtractFactsAndUsage(agentctx.LLMCallContext{Ctx: ctx, HTTPClient: r.llmHTTPClient, Config: r.aiConfig}, sessionText, facts, utils.CognitiveRetryOptions{
				MaxRetries:     config.AssistantMaxLLMRetries,
				InitialBackoff: config.AssistantLLMRetryInitialBackoff,
				MaxBackoff:     config.AssistantLLMRetryMaxBackoff,
				LogPrefix:      logPrefix,
				ChannelID:      meta.ChannelID,
			})
			if err != nil {
				log.Printf("%s fact engine periodic failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if len(res.Facts) > 0 || len(res.UsedFactIDs) > 0 {
				facts.Facts = memory.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
				facts = memory.UpsertFacts(now, facts, res.Facts, config.AssistantMaxFacts)
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
			if now.Sub(meta.LastMessageAt) <= config.AssistantSessionGap {
				return
			}
			if meta.LastSummarizedRecordID == meta.RecordID {
				return
			}
			if err := r.finalizeRecord(ctx, logPrefix, userID, paths, &meta); err != nil {
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

			q = proactive.RunProactiveQueueForUser(agentctx.AssistantRequestContext{
				Ctx:       ctx,
				UserID:    userID,
				LogPrefix: logPrefix,
				TimeLoc:   r.timeLoc,
				Persona:   r.persona,
				LLM:       agentctx.LLMCallContext{Ctx: ctx, HTTPClient: r.llmHTTPClient, Config: r.aiConfig},
				Mew:       agentctx.MewCallContext{Ctx: ctx, HTTPClient: r.session.HTTPClient(), APIBase: r.apiBase},
				History:   agentctx.HistoryCallContext{Ctx: ctx, Fetcher: r.fetcher, TimeLoc: r.timeLoc},
			}, q, meta, summaries)

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
