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

	"mew/plugins/pkg"
	"mew/plugins/pkg/api/gateway/socketio"
	"mew/plugins/pkg/api/messages"
)

type ClaudeCodeRunner struct {
	botID       string
	botName     string
	accessToken string
	session     *sdk.BotSession

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	proxyClient   *ClaudeCodeProxyClient

	botUserID string

	dmChannels *sdk.DMChannelCache

	continuedMu      sync.RWMutex
	channelContinued map[string]bool
}

func NewClaudeCodeRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*ClaudeCodeRunner, error) {
	agentCfg, err := ParseClaudeCodeConfig(rawConfig)
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

	proxyHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{
		Timeout: time.Duration(agentCfg.TimeoutSecond) * time.Second,
		Mode:    "direct",
	})
	if err != nil {
		return nil, err
	}
	proxyClient, err := NewClaudeCodeProxyClient(agentCfg.ProxyBaseURL, proxyHTTPClient)
	if err != nil {
		return nil, err
	}

	return &ClaudeCodeRunner{
		botID:            botID,
		botName:          botName,
		accessToken:      accessToken,
		session:          nil,
		apiBase:          strings.TrimRight(cfg.APIBase, "/"),
		mewURL:           mewURL,
		wsURL:            wsURL,
		mewHTTPClient:    mewHTTPClient,
		proxyClient:      proxyClient,
		botUserID:        "",
		dmChannels:       sdk.NewDMChannelCache(),
		channelContinued: make(map[string]bool),
	}, nil
}

func (r *ClaudeCodeRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("[claudecode-agent] bot=%s name=%q", r.botID, r.botName)

	r.session = sdk.NewBotSession(r.apiBase, r.accessToken, r.mewHTTPClient)
	me, err := r.session.User(ctx)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID

	if err := r.dmChannels.RefreshWithBotSession(ctx, r.session); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	return socketio.RunGatewayWithReconnectSession(ctx, r.wsURL, r.session, func(ctx context.Context, eventName string, payload json.RawMessage, emit socketio.EmitFunc) error {
		if eventName != "MESSAGE_CREATE" {
			return nil
		}

		msg, ok := messages.ParseChannelMessage(payload)
		if !ok {
			return nil
		}
		if msg.AuthorID() == r.botUserID {
			return nil
		}

		reply, ok, err := r.maybeHandleMessage(ctx, msg.ChannelID, msg.ContextText())
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		if strings.TrimSpace(reply) == "" {
			reply = "(empty response)"
		}

		if err := emit("message/create", map[string]any{
			"channelId": msg.ChannelID,
			"content":   reply,
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

func (r *ClaudeCodeRunner) maybeHandleMessage(ctx context.Context, channelID, content string) (reply string, ok bool, err error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return "", false, nil
	}

	if rest, mentioned := socketio.StripLeadingBotMention(trimmed, r.botUserID); mentioned {
		return r.handleCommand(ctx, channelID, rest)
	}

	if r.dmChannels.Has(channelID) {
		return r.handleCommand(ctx, channelID, trimmed)
	}

	if err := r.dmChannels.RefreshWithBotSession(ctx, r.session); err != nil {
		return "", false, err
	}
	if r.dmChannels.Has(channelID) {
		return r.handleCommand(ctx, channelID, trimmed)
	}
	return "", false, nil
}

func (r *ClaudeCodeRunner) handleCommand(ctx context.Context, channelID, raw string) (reply string, ok bool, err error) {
	command := strings.TrimSpace(raw)
	if command == "" {
		return "", false, nil
	}

	if strings.EqualFold(command, "/clear") {
		r.setChannelContinued(channelID, false)
		return "会话已清空。", true, nil
	}

	continued := r.getChannelContinued(channelID)
	out, err := r.proxyClient.Chat(ctx, channelID, command, continued)
	if err != nil {
		return fmt.Sprintf("claude-code 调用失败: %v", err), true, nil
	}

	r.setChannelContinued(channelID, true)
	return out, true, nil
}

func (r *ClaudeCodeRunner) getChannelContinued(channelID string) bool {
	r.continuedMu.RLock()
	defer r.continuedMu.RUnlock()
	return r.channelContinued[channelID]
}

func (r *ClaudeCodeRunner) setChannelContinued(channelID string, continued bool) {
	r.continuedMu.Lock()
	defer r.continuedMu.Unlock()
	r.channelContinued[channelID] = continued
}
