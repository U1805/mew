package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"mew/plugins/sdk"
	"mew/plugins/sdk/api/gateway/socketio"
)

type TestAgentRunner struct {
	botID       string
	botName     string
	accessToken string // bot access token from bootstrap (not a JWT)
	session     *sdk.BotSession

	apiBase string
	mewURL  string
	wsURL   string

	httpClient *http.Client

	botUserID string

	dmChannels *sdk.DMChannelCache
}

func NewTestAgentRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*TestAgentRunner, error) {
	mewURL := sdk.MewURLFromEnvOrAPIBase(cfg.APIBase, "http://localhost:3000")

	wsURL, err := socketio.WebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	httpClient, err := sdk.NewMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	return &TestAgentRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		session:     nil,
		apiBase:     strings.TrimRight(cfg.APIBase, "/"),
		mewURL:      mewURL,
		wsURL:       wsURL,
		httpClient:  httpClient,
		botUserID:   "",
		dmChannels:  sdk.NewDMChannelCache(),
	}, nil
}

func (r *TestAgentRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("[test-agent] bot=%s name=%q", r.botID, r.botName)

	r.session = sdk.NewBotSession(r.apiBase, r.accessToken, r.httpClient)
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

		var msg socketMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			return err
		}
		if sdk.IsOwnMessage(msg.AuthorID, r.botUserID) {
			return nil
		}

		reply, ok, err := r.maybeEcho(ctx, msg.ChannelID, msg.Content)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}

		if err := emit("message/create", map[string]any{
			"channelId": msg.ChannelID,
			"content":   reply,
		}); err != nil {
			return fmt.Errorf("send message failed: %w", err)
		}
		log.Printf("%s echo replied: channel=%s content=%q", logPrefix, msg.ChannelID, reply)
		return nil
	}, socketio.GatewayOptions{}, socketio.ReconnectOptions{
		InitialBackoff: 500 * time.Millisecond,
		MaxBackoff:     10 * time.Second,
		OnDisconnect: func(err error, nextBackoff time.Duration) {
			log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, nextBackoff)
		},
	})
}
