package bot

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"mew/plugins/assistant-agent/internal/ai"
	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/assistant-agent/internal/mew"
	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
	"mew/plugins/sdk/client/socketio"
)

type Runner struct {
	serviceType string
	botID       string
	botName     string
	accessToken string
	userToken   string
	botUserID   string

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	llmHTTPClient *http.Client

	aiConfig config.AssistantConfig
	persona  string

	dmChannels *sdk.DMChannelCache
	store      *store.Store
	fetcher    *mew.Fetcher

	userMu   sync.Mutex
	userLock map[string]*sync.Mutex

	knownUsersMu sync.RWMutex
	knownUsers   map[string]struct{}
}

func NewAssistantRunner(serviceType, botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*Runner, error) {
	mewURL := sdk.MewURLFromEnvOrAPIBase(cfg.APIBase, assistantDefaultMewURL)
	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmCfg, err := config.ParseAssistantConfig(rawConfig)
	if err != nil {
		return nil, err
	}

	persona, err := ai.ReadPromptWithOverrides(PersonaPromptRelPath, PersonaPromptEmbeddedName)
	if err != nil {
		return nil, fmt.Errorf("read persona failed: %w", err)
	}

	r := &Runner{
		serviceType:   serviceType,
		botID:         botID,
		botName:       botName,
		accessToken:   accessToken,
		userToken:     "",
		botUserID:     "",
		apiBase:       strings.TrimRight(cfg.APIBase, "/"),
		mewURL:        mewURL,
		wsURL:         wsURL,
		mewHTTPClient: mewHTTPClient,
		llmHTTPClient: ai.NewHTTPClient(),
		aiConfig:      llmCfg,
		persona:       persona,
		dmChannels:    sdk.NewDMChannelCache(),
		store:         store.NewStore(serviceType, botID),
		fetcher: &mew.Fetcher{
			HTTPClient:         mewHTTPClient,
			APIBase:            strings.TrimRight(cfg.APIBase, "/"),
			UserToken:          "",
			PageSize:           assistantFetchPageSize,
			MaxPages:           assistantMaxFetchPages,
			SessionGap:         assistantSessionGap,
			MaxSessionMessages: assistantMaxSessionMessages,
		},
		userLock:   map[string]*sync.Mutex{},
		knownUsers: map[string]struct{}{},
	}
	return r, nil
}

func (r *Runner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("%s bot=%s name=%q", assistantLogPrefix, r.botID, r.botName)

	me, token, err := sdk.LoginBot(ctx, r.mewHTTPClient, r.apiBase, r.accessToken)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	r.userToken = token
	r.fetcher.UserToken = token

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	g := sdk.NewGroup(ctx)
	g.Go(func(ctx context.Context) {
		sdk.RunInterval(ctx, 5*time.Minute, true, func(ctx context.Context) {
			r.runPeriodicFactEngine(ctx, logPrefix)
			r.finalizeStaleSessions(ctx, logPrefix)
		})
	})
	g.Go(func(ctx context.Context) {
		err := socketio.RunGatewayWithReconnect(ctx, r.wsURL, r.userToken, func(ctx context.Context, eventName string, payload json.RawMessage, emit socketio.EmitFunc) error {
			if eventName != assistantEventMessageCreate {
				return nil
			}
			if len(payload) == 0 {
				return nil
			}
			if err := r.handleMessageCreate(ctx, logPrefix, payload, emit); err != nil {
				log.Printf("%s event handler error: %v", logPrefix, err)
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
			paths := r.store.Paths(userID)
			meta, err := store.LoadMetadata(paths.MetadataPath)
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
			if now.Sub(meta.LastMessageAt) > assistantSessionGap {
				return
			}
			if strings.TrimSpace(meta.LastFactRecordID) == strings.TrimSpace(meta.RecordID) && !meta.LastFactProcessedAt.IsZero() && !meta.LastMessageAt.After(meta.LastFactProcessedAt) {
				return
			}

			facts, err := store.LoadFacts(paths.FactsPath)
			if err != nil {
				log.Printf("%s load facts failed (periodic): user=%s err=%v", logPrefix, userID, err)
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

			sessionText := ai.FormatSessionRecordForContext(sessionMsgs)
			res, err := ai.ExtractFactsAndUsage(ctx, r.llmHTTPClient, r.aiConfig, sessionText, facts)
			if err != nil {
				log.Printf("%s fact engine periodic failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if len(res.Facts) > 0 || len(res.UsedFactIDs) > 0 {
				facts.Facts = store.TouchFactsByIDs(facts.Facts, res.UsedFactIDs, now)
				facts = store.UpsertFacts(now, facts, res.Facts, assistantMaxFacts)
				_ = store.SaveFacts(paths.FactsPath, facts)
				log.Printf("%s facts updated (periodic): user=%s record=%s count=%d used=%d new=%d", logPrefix, userID, meta.RecordID, len(facts.Facts), len(res.UsedFactIDs), len(res.Facts))
			}

			meta.LastFactRecordID = meta.RecordID
			meta.LastFactProcessedAt = meta.LastMessageAt
			_ = store.SaveMetadata(paths.MetadataPath, meta)
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
			paths := r.store.Paths(userID)
			meta, err := store.LoadMetadata(paths.MetadataPath)
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
			if now.Sub(meta.LastMessageAt) <= assistantSessionGap {
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

func (r *Runner) refreshDMChannels(ctx context.Context) error {
	return r.dmChannels.Refresh(ctx, r.mewHTTPClient, r.apiBase, r.userToken)
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
