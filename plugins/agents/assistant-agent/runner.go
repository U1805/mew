package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"mew/plugins/sdk"
	"mew/plugins/sdk/socketio"
)

type AssistantRunner struct {
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

	llmConfig AssistantConfig
	persona   string

	dmChannels *sdk.DMChannelCache

	userMu   sync.Mutex
	userLock map[string]*sync.Mutex

	knownUsersMu sync.RWMutex
	knownUsers   map[string]struct{}
}

func NewAssistantRunner(serviceType, botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*AssistantRunner, error) {
	mewURL := sdk.MewURLFromEnvOrAPIBase(cfg.APIBase, assistantDefaultMewURL)
	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmCfg, err := parseAssistantConfig(rawConfig)
	if err != nil {
		return nil, err
	}

	personaBytes, err := os.ReadFile(assistantPersonaFilename)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("read persona file failed: %w", err)
	}
	persona := strings.TrimSpace(string(personaBytes))

	return &AssistantRunner{
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
		llmHTTPClient: newLLMHTTPClient(),
		llmConfig:     llmCfg,
		persona:       persona,
		dmChannels:    sdk.NewDMChannelCache(),
		userLock:      map[string]*sync.Mutex{},
		knownUsers:    map[string]struct{}{},
	}, nil
}

func (r *AssistantRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("%s bot=%s name=%q", assistantLogPrefix, r.botID, r.botName)

	me, token, err := sdk.LoginBot(ctx, r.mewHTTPClient, r.apiBase, r.accessToken)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	r.userToken = token

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	g := sdk.NewGroup(ctx)
	g.Go(func(ctx context.Context) {
		sdk.RunInterval(ctx, 5*time.Minute, true, func(ctx context.Context) {
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

func (r *AssistantRunner) finalizeStaleSessions(ctx context.Context, logPrefix string) {
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
			paths := assistantUserStatePaths(r.serviceType, r.botID, userID)
			meta, err := loadMetadata(paths.MetadataPath)
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

func (r *AssistantRunner) handleMessageCreate(
	ctx context.Context,
	logPrefix string,
	payload json.RawMessage,
	emit socketio.EmitFunc,
) error {
	var msg mewMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return err
	}
	if strings.TrimSpace(msg.ChannelID) == "" || strings.TrimSpace(msg.ID) == "" {
		return nil
	}
	if r.isOwnAuthor(msg.AuthorRaw) {
		return nil
	}
	if !r.isDMChannel(msg.ChannelID) {
		if err := r.refreshDMChannels(ctx); err != nil {
			return nil
		}
		if !r.isDMChannel(msg.ChannelID) {
			return nil
		}
	}

	userID := msg.AuthorID()
	if userID == "" {
		return nil
	}

	log.Printf("%s DM MESSAGE_CREATE: channel=%s msg=%s user=%s content=%q",
		logPrefix,
		msg.ChannelID,
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

func (r *AssistantRunner) isOwnAuthor(authorRaw json.RawMessage) bool {
	return sdk.IsOwnMessage(authorRaw, r.botUserID)
}

func (r *AssistantRunner) isDMChannel(channelID string) bool {
	return r.dmChannels.Has(channelID)
}

func (r *AssistantRunner) refreshDMChannels(ctx context.Context) error {
	return r.dmChannels.Refresh(ctx, r.mewHTTPClient, r.apiBase, r.userToken)
}

func (r *AssistantRunner) userMutex(userID string) *sync.Mutex {
	r.userMu.Lock()
	defer r.userMu.Unlock()
	if mu, ok := r.userLock[userID]; ok {
		return mu
	}
	mu := &sync.Mutex{}
	r.userLock[userID] = mu
	return mu
}
