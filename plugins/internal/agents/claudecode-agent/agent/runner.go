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
	sdkapi "mew/plugins/pkg/api"
	"mew/plugins/pkg/api/gateway/socketio"
	"mew/plugins/pkg/api/messages"
)

type ClaudeCodeRunner struct {
	botID       string
	botName     string
	logPrefix   string
	accessToken string
	session     *sdk.BotSession

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	proxyClient   *ClaudeCodeProxyClient
	proxyBaseURL  string
	proxyTimeout  int

	botUserID string

	dmChannels *sdk.DMChannelCache

	continuedMu      sync.RWMutex
	channelContinued map[string]bool
}

const (
	claudeCodeLogContentPreviewLen = 160
	claudeCodeIncomingQueueSize    = 128
)

type messageCreateJob struct {
	msg  sdkapi.ChannelMessage
	emit socketio.EmitFunc
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
		logPrefix:        fmt.Sprintf("[claudecode-agent] bot=%s name=%q", botID, botName),
		accessToken:      accessToken,
		session:          nil,
		apiBase:          strings.TrimRight(cfg.APIBase, "/"),
		mewURL:           mewURL,
		wsURL:            wsURL,
		mewHTTPClient:    mewHTTPClient,
		proxyClient:      proxyClient,
		proxyBaseURL:     strings.TrimRight(agentCfg.ProxyBaseURL, "/"),
		proxyTimeout:     agentCfg.TimeoutSecond,
		botUserID:        "",
		dmChannels:       sdk.NewDMChannelCache(),
		channelContinued: make(map[string]bool),
	}, nil
}

func (r *ClaudeCodeRunner) Run(ctx context.Context) error {
	logPrefix := r.logPrefix

	r.session = sdk.NewBotSession(r.apiBase, r.accessToken, r.mewHTTPClient)
	me, err := r.session.User(ctx)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	log.Printf("%s authenticated: botUserID=%s apiBase=%s wsURL=%s proxy=%s timeout=%ds",
		logPrefix, r.botUserID, r.apiBase, r.wsURL, r.proxyBaseURL, r.proxyTimeout)

	if err := r.dmChannels.RefreshWithBotSession(ctx, r.session); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	} else {
		log.Printf("%s DM channels cache initialized", logPrefix)
	}

	jobs := make(chan messageCreateJob, claudeCodeIncomingQueueSize)
	workerDone := make(chan struct{})
	go func() {
		defer close(workerDone)
		for {
			select {
			case <-ctx.Done():
				return
			case job, ok := <-jobs:
				if !ok {
					return
				}
				r.handleMessageCreateJob(ctx, logPrefix, job)
			}
		}
	}()
	defer func() {
		close(jobs)
		<-workerDone
	}()

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

		// Keep gateway callback fast; long-running Claude calls must run outside read loop.
		select {
		case jobs <- messageCreateJob{msg: msg, emit: emit}:
			log.Printf("%s MESSAGE_CREATE queued: channel=%s msg=%s user=%s qcap=%d content=%q",
				logPrefix,
				msg.ChannelID,
				msg.ID,
				msg.AuthorID(),
				claudeCodeIncomingQueueSize,
				sdk.PreviewString(msg.ContextText(), claudeCodeLogContentPreviewLen),
			)
		default:
			log.Printf("%s incoming queue full, drop MESSAGE_CREATE: channel=%s msg=%s size=%d",
				logPrefix, msg.ChannelID, msg.ID, claudeCodeIncomingQueueSize)
		}
		return nil
	}, socketio.GatewayOptions{}, socketio.ReconnectOptions{
		InitialBackoff: 500 * time.Millisecond,
		MaxBackoff:     10 * time.Second,
		OnDisconnect: func(err error, nextBackoff time.Duration) {
			log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, nextBackoff)
		},
	})
}

func (r *ClaudeCodeRunner) handleMessageCreateJob(ctx context.Context, logPrefix string, job messageCreateJob) {
	msg := job.msg
	log.Printf("%s MESSAGE_CREATE handling: channel=%s msg=%s user=%s content=%q",
		logPrefix,
		msg.ChannelID,
		msg.ID,
		msg.AuthorID(),
		sdk.PreviewString(msg.ContextText(), claudeCodeLogContentPreviewLen),
	)

	ok, err := r.maybeHandleMessage(ctx, msg.ChannelID, msg.ContextText(), job.emit)
	if err != nil {
		log.Printf("%s message handle failed: channel=%s msg=%s err=%v", logPrefix, msg.ChannelID, msg.ID, err)
		return
	}
	if !ok {
		log.Printf("%s message ignored: channel=%s msg=%s", logPrefix, msg.ChannelID, msg.ID)
	} else {
		log.Printf("%s message handled: channel=%s msg=%s", logPrefix, msg.ChannelID, msg.ID)
	}
}

func (r *ClaudeCodeRunner) maybeHandleMessage(ctx context.Context, channelID, content string, emit socketio.EmitFunc) (ok bool, err error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		log.Printf("%s skip empty content: channel=%s", r.logPrefix, channelID)
		return false, nil
	}

	if rest, mentioned := socketio.StripLeadingBotMention(trimmed, r.botUserID); mentioned {
		log.Printf("%s route by mention: channel=%s", r.logPrefix, channelID)
		return r.handleCommand(ctx, channelID, rest, emit)
	}

	if r.dmChannels.Has(channelID) {
		log.Printf("%s route by DM cache hit: channel=%s", r.logPrefix, channelID)
		return r.handleCommand(ctx, channelID, trimmed, emit)
	}

	if err := r.dmChannels.RefreshWithBotSession(ctx, r.session); err != nil {
		log.Printf("%s DM channel refresh failed on demand: channel=%s err=%v", r.logPrefix, channelID, err)
		return false, err
	}
	if r.dmChannels.Has(channelID) {
		log.Printf("%s route by DM cache refresh: channel=%s", r.logPrefix, channelID)
		return r.handleCommand(ctx, channelID, trimmed, emit)
	}
	log.Printf("%s ignore non-DM and no leading mention: channel=%s", r.logPrefix, channelID)
	return false, nil
}

func (r *ClaudeCodeRunner) handleCommand(ctx context.Context, channelID, raw string, emit socketio.EmitFunc) (ok bool, err error) {
	command := strings.TrimSpace(raw)
	if command == "" {
		log.Printf("%s skip empty command: channel=%s", r.logPrefix, channelID)
		return false, nil
	}

	if strings.EqualFold(command, "/clear") {
		r.setChannelContinued(channelID, false)
		log.Printf("%s command /clear: channel=%s", r.logPrefix, channelID)
		if err := emitChannelMessage(emit, channelID, "会话已清空。"); err != nil {
			return true, err
		}
		return true, nil
	}

	continued := r.getChannelContinued(channelID)
	mode := "-p"
	if continued {
		mode = "-c -p"
	}
	start := time.Now()
	log.Printf("%s proxy request start: channel=%s mode=%s prompt_len=%d prompt=%q",
		r.logPrefix,
		channelID,
		mode,
		len(command),
		sdk.PreviewString(command, claudeCodeLogContentPreviewLen),
	)
	parser := NewClaudeStreamParser()
	sentMessages := 0

	chunks, err := r.proxyClient.ChatStream(ctx, channelID, command, continued, func(line string) error {
		log.Printf("%s proxy chunk: channel=%s mode=%s chunk_len=%d chunk=%q",
			r.logPrefix, channelID, mode, len(line), sdk.PreviewString(line, claudeCodeLogContentPreviewLen))
		outMsgs, parseErr := parser.FeedLine(line)
		if parseErr != nil {
			log.Printf("%s proxy chunk parse failed: channel=%s mode=%s err=%v", r.logPrefix, channelID, mode, parseErr)
			if err := emitChannelMessage(emit, channelID, line); err != nil {
				return err
			}
			sentMessages++
			return nil
		}

		for _, m := range outMsgs {
			m = strings.TrimSpace(m)
			if m == "" {
				continue
			}
			if err := emitChannelMessage(emit, channelID, m); err != nil {
				return err
			}
			sentMessages++
		}
		return nil
	})
	elapsed := time.Since(start)
	if err != nil {
		log.Printf("%s proxy request failed: channel=%s mode=%s elapsed=%s err=%v",
			r.logPrefix, channelID, mode, elapsed, err)
		_ = emitChannelMessage(emit, channelID, fmt.Sprintf("claude-code 调用失败: %v", err))
		return true, nil
	}

	for _, m := range parser.Flush() {
		m = strings.TrimSpace(m)
		if m == "" {
			continue
		}
		if err := emitChannelMessage(emit, channelID, m); err != nil {
			return true, err
		}
		sentMessages++
	}

	r.setChannelContinued(channelID, true)
	log.Printf("%s proxy request success: channel=%s mode=%s elapsed=%s chunks=%d messages=%d",
		r.logPrefix, channelID, mode, elapsed, chunks, sentMessages)
	if chunks == 0 || sentMessages == 0 {
		if err := emitChannelMessage(emit, channelID, "(empty response)"); err != nil {
			return true, err
		}
	}
	return true, nil
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

func emitChannelMessage(emit socketio.EmitFunc, channelID, content string) error {
	return emit("message/create", map[string]any{
		"channelId": channelID,
		"content":   content,
	})
}
