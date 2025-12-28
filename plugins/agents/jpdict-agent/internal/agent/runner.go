package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"mew/plugins/jpdict-agent/internal/config"
	"mew/plugins/sdk"
	"mew/plugins/sdk/mew"
	"mew/plugins/sdk/socketio"
)

type JpdictRunner struct {
	serviceType string

	botID       string
	botName     string
	accessToken string // bot access token from bootstrap (not a JWT)
	userToken   string // JWT issued by /api/auth/bot

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	llmHTTPClient *http.Client

	botUserID string

	systemPrompt string

	cfgMu sync.RWMutex
	cfg   config.JpdictConfig

	dmChannels *sdk.DMChannelCache
}

func NewJpdictRunner(serviceType, botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*JpdictRunner, error) {
	parsedCfg, err := config.ParseJpdictConfig(rawConfig)
	if err != nil {
		return nil, err
	}

	mewURL := sdk.MewURLFromEnvOrAPIBase(cfg.APIBase, "http://localhost:3000")

	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmTransport := http.DefaultTransport.(*http.Transport).Clone()
	llmTransport.Proxy = nil
	llmHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout:     75 * time.Second,
		UseMEWProxy: true,
		Transport:   llmTransport,
	})
	if err != nil {
		return nil, err
	}

	systemPrompt, err := loadJpdictSystemPrompt()
	if err != nil {
		return nil, err
	}

	return &JpdictRunner{
		serviceType:   serviceType,
		botID:         botID,
		botName:       botName,
		accessToken:   accessToken,
		userToken:     "",
		apiBase:       strings.TrimRight(cfg.APIBase, "/"),
		mewURL:        mewURL,
		wsURL:         wsURL,
		mewHTTPClient: mewHTTPClient,
		llmHTTPClient: llmHTTPClient,
		botUserID:     "",
		systemPrompt:  systemPrompt,
		cfg:           parsedCfg,
		dmChannels:    sdk.NewDMChannelCache(),
		cfgMu:         sync.RWMutex{},
	}, nil
}

func (r *JpdictRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("[jpdict-agent] bot=%s name=%q", r.botID, r.botName)

	me, token, err := sdk.LoginBot(ctx, r.mewHTTPClient, r.apiBase, r.accessToken)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	r.userToken = token

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	return socketio.RunGatewayWithReconnect(ctx, r.wsURL, r.userToken, func(ctx context.Context, eventName string, payload json.RawMessage, emit socketio.EmitFunc) error {
		if eventName != "MESSAGE_CREATE" {
			return nil
		}

		var msg socketMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			return err
		}
		for i := range msg.Attachments {
			msg.Attachments[i].ChannelID = msg.ChannelID
		}

		if r.isOwnMessage(msg.AuthorID) {
			return nil
		}

		out, ok, err := r.maybeHandleMessage(ctx, msg)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}

		if err := emit("message/create", map[string]any{
			"channelId": msg.ChannelID,
			"type":      out.Type,
			"content":   out.Content,
			"payload":   out.Payload,
		}); err != nil {
			return fmt.Errorf("send message failed: %w", err)
		}
		log.Printf("%s replied: channel=%s", logPrefix, msg.ChannelID)
		return nil
	}, socketio.GatewayOptions{}, socketio.ReconnectOptions{
		InitialBackoff: 500 * time.Millisecond,
		MaxBackoff:     10 * time.Second,
		OnDisconnect: func(err error, nextBackoff time.Duration) {
			log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, nextBackoff)
		},
	})
}

func (r *JpdictRunner) maybeHandleMessage(ctx context.Context, msg socketMessage) (out outboundMessage, ok bool, err error) {
	trimmed := strings.TrimSpace(msg.Content)
	attachments := msg.Attachments

	// Channel: require a leading mention.
	if rest, mentioned := socketio.StripLeadingBotMention(trimmed, r.botUserID); mentioned {
		return r.handleQuery(ctx, rest, attachments)
	}

	// DM: no mention required, but must be in a DM channel.
	if !r.isDMChannel(msg.ChannelID) {
		if err := r.refreshDMChannels(ctx); err != nil {
			return outboundMessage{}, false, err
		}
		if !r.isDMChannel(msg.ChannelID) {
			return outboundMessage{}, false, nil
		}
	}
	return r.handleQuery(ctx, trimmed, attachments)
}

// ---- MEW / gateway helpers (mostly copied from test-agent) ----

type socketMessage struct {
	ChannelID    string             `json:"channelId"`
	Content      string             `json:"content"`
	Attachments  []socketAttachment `json:"attachments"`
	AuthorID     json.RawMessage    `json:"authorId"`
	ReferencedID string             `json:"referencedMessageId,omitempty"`
}

type socketAttachment = mew.AttachmentRef

func (r *JpdictRunner) isOwnMessage(authorRaw json.RawMessage) bool {
	return sdk.IsOwnMessage(authorRaw, r.botUserID)
}

func (r *JpdictRunner) isDMChannel(channelID string) bool {
	return r.dmChannels.Has(channelID)
}

func (r *JpdictRunner) refreshDMChannels(ctx context.Context) error {
	return r.dmChannels.Refresh(ctx, r.mewHTTPClient, r.apiBase, r.userToken)
}
