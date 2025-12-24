package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"mew/plugins/sdk"
	"mew/plugins/sdk/httpx"
)

type TestInteractiveRunner struct {
	botID       string
	botName     string
	accessToken string // bot access token from bootstrap (not a JWT)
	userToken   string // JWT issued by /api/auth/bot

	apiBase string
	mewURL  string
	wsURL   string

	httpClient *http.Client

	botUserID string

	dmMu        sync.RWMutex
	dmChannelID map[string]struct{}
}

func NewTestInteractiveRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*TestInteractiveRunner, error) {
	mewURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_URL")), "/")
	if mewURL == "" {
		// Best-effort fallback when MEW_API_BASE is customized.
		mewURL = strings.TrimRight(strings.TrimSuffix(cfg.APIBase, "/api"), "/")
	}
	if mewURL == "" {
		mewURL = "http://localhost:3000"
	}

	wsURL, err := socketIOWebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	httpClient, err := newMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	return &TestInteractiveRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		userToken:   "",
		apiBase:     strings.TrimRight(cfg.APIBase, "/"),
		mewURL:      mewURL,
		wsURL:       wsURL,
		httpClient:  httpClient,
		dmChannelID: map[string]struct{}{},
		botUserID:   "",
		dmMu:        sync.RWMutex{},
	}, nil
}

func (r *TestInteractiveRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("[test-interactive] bot=%s name=%q", r.botID, r.botName)

	me, token, err := r.loginBot(ctx)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	r.userToken = token

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	backoff := 500 * time.Millisecond
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		err := r.runSocketOnce(ctx, logPrefix)
		if ctx.Err() != nil {
			return ctx.Err()
		}

		log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, backoff)
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}

		if backoff < 10*time.Second {
			backoff *= 2
		}
	}
}

func (r *TestInteractiveRunner) runSocketOnce(ctx context.Context, logPrefix string) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.Dial(r.wsURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	var writeMu sync.Mutex
	sendText := func(payload string) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteMessage(websocket.TextMessage, []byte(payload))
	}

	emit := func(event string, payload any) error {
		frame, err := json.Marshal([]any{event, payload})
		if err != nil {
			return err
		}
		return sendText("42" + string(frame))
	}

	// If ctx is canceled, proactively close the connection to unblock reads.
	stop := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "shutdown"), time.Now().Add(2*time.Second))
			_ = conn.Close()
		case <-stop:
		}
	}()
	defer close(stop)

	authed := false

	for {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return err
		}

		for _, frame := range splitSocketIOFrames(msg) {
			s := string(frame)
			if s == "" {
				continue
			}

			switch s[0] {
			case '0': // Engine.IO open
				authPayload, _ := json.Marshal(map[string]string{"token": r.userToken})
				if err := sendText("40" + string(authPayload)); err != nil {
					return err
				}
			case '1': // Engine.IO close
				return errors.New("engine.io close")
			case '2': // ping
				if err := sendText("3"); err != nil {
					return err
				}
			case '4': // message (Socket.IO)
				if len(s) >= 2 && s[1] == '0' {
					// CONNECT OK: "40"
					authed = true
					log.Printf("%s connected to gateway (mewURL=%s)", logPrefix, r.mewURL)
					continue
				}
				if len(s) >= 2 && s[1] == '4' {
					// ERROR: "44{...}"
					return fmt.Errorf("socket.io error: %s", strings.TrimSpace(s))
				}
				if strings.HasPrefix(s, "42") {
					if err := r.handleEvent(ctx, logPrefix, s[2:], emit); err != nil {
						log.Printf("%s event handler error: %v", logPrefix, err)
					}
				}
			default:
			}
		}

		if !authed {
			continue
		}
	}
}

func (r *TestInteractiveRunner) handleEvent(
	ctx context.Context,
	logPrefix string,
	raw string,
	emit func(event string, payload any) error,
) error {
	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return err
	}
	if len(arr) == 0 {
		return nil
	}

	var eventName string
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return err
	}
	if eventName != "MESSAGE_CREATE" {
		return nil
	}
	if len(arr) < 2 {
		return nil
	}

	var msg socketMessage
	if err := json.Unmarshal(arr[1], &msg); err != nil {
		return err
	}

	if r.isOwnMessage(msg.AuthorID) {
		return nil
	}

	reply, ok, err := r.maybeEcho(ctx, msg.ChannelID, msg.Content)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	// Send via gateway upstream write, so we don't need serverId for guild channels.
	if err := emit("message/create", map[string]any{
		"channelId": msg.ChannelID,
		"content":   reply,
	}); err != nil {
		return fmt.Errorf("send message failed: %w", err)
	}
	log.Printf("%s echo replied: channel=%s content=%q", logPrefix, msg.ChannelID, reply)
	return nil
}

func (r *TestInteractiveRunner) maybeEcho(ctx context.Context, channelID, content string) (reply string, ok bool, err error) {
	trimmed := strings.TrimSpace(content)

	// Channel: require a leading mention.
	if rest, mentioned := stripLeadingBotMention(trimmed, r.botUserID); mentioned {
		reply, ok := parseEcho(rest)
		return reply, ok, nil
	}

	// DM: no mention required, but must be in a DM channel.
	reply, ok = parseEcho(trimmed)
	if !ok {
		return "", false, nil
	}

	if r.isDMChannel(channelID) {
		return reply, true, nil
	}

	// DM channels can be created after the bot connects; refresh once on demand.
	if err := r.refreshDMChannels(ctx); err != nil {
		return "", false, err
	}
	if r.isDMChannel(channelID) {
		return reply, true, nil
	}
	return "", false, nil
}

func (r *TestInteractiveRunner) isDMChannel(channelID string) bool {
	r.dmMu.RLock()
	defer r.dmMu.RUnlock()
	_, ok := r.dmChannelID[channelID]
	return ok
}

func (r *TestInteractiveRunner) refreshDMChannels(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.apiBase+"/users/@me/channels", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.userToken)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var channels []struct {
		ID   string `json:"_id"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &channels); err != nil {
		return err
	}

	next := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		if strings.TrimSpace(ch.ID) == "" {
			continue
		}
		if ch.Type != "DM" {
			continue
		}
		next[ch.ID] = struct{}{}
	}

	r.dmMu.Lock()
	r.dmChannelID = next
	r.dmMu.Unlock()
	return nil
}

func (r *TestInteractiveRunner) loginBot(ctx context.Context) (me meUser, token string, err error) {
	reqBody, err := json.Marshal(map[string]any{"accessToken": r.accessToken})
	if err != nil {
		return meUser{}, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.apiBase+"/auth/bot", bytes.NewReader(reqBody))
	if err != nil {
		return meUser{}, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return meUser{}, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return meUser{}, "", fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		User  meUser `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return meUser{}, "", err
	}
	if strings.TrimSpace(parsed.User.ID) == "" || strings.TrimSpace(parsed.Token) == "" {
		return meUser{}, "", fmt.Errorf("invalid /auth/bot response: missing user/token")
	}

	return parsed.User, parsed.Token, nil
}

type socketMessage struct {
	ChannelID string          `json:"channelId"`
	Content   string          `json:"content"`
	AuthorID  json.RawMessage `json:"authorId"`
}

type meUser struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	IsBot    bool   `json:"isBot"`
}

func (r *TestInteractiveRunner) isOwnMessage(authorRaw json.RawMessage) bool {
	authorRaw = bytes.TrimSpace(authorRaw)
	if len(authorRaw) == 0 || authorRaw[0] != '{' {
		return false
	}
	var author struct {
		ID    string `json:"_id"`
		IsBot bool   `json:"isBot"`
	}
	if err := json.Unmarshal(authorRaw, &author); err != nil {
		return false
	}
	if strings.TrimSpace(author.ID) == "" {
		return false
	}
	return author.ID == r.botUserID
}

func socketIOWebsocketURL(mewURL string) (string, error) {
	u, err := url.Parse(mewURL)
	if err != nil {
		return "", err
	}

	switch strings.ToLower(u.Scheme) {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("invalid MEW_URL scheme: %q", u.Scheme)
	}

	u.Path = "/socket.io/"
	q := u.Query()
	q.Set("EIO", "4")
	q.Set("transport", "websocket")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func splitSocketIOFrames(msg []byte) [][]byte {
	// Socket.IO may return multiple frames separated by RS (0x1e).
	if bytes.IndexByte(msg, 0x1e) < 0 {
		return [][]byte{msg}
	}
	parts := bytes.Split(msg, []byte{0x1e})
	out := make([][]byte, 0, len(parts))
	for _, p := range parts {
		if len(p) == 0 {
			continue
		}
		out = append(out, p)
	}
	return out
}

func parseEcho(content string) (reply string, ok bool) {
	s := strings.TrimSpace(content)
	if s == "" {
		return "", false
	}
	if len(s) < 4 {
		return "", false
	}
	if !strings.EqualFold(s[:4], "echo") {
		return "", false
	}
	if len(s) == 4 {
		return "", false
	}
	next := s[4]
	if next != ' ' && next != '\t' && next != '\n' && next != '\r' {
		return "", false
	}
	rest := strings.TrimSpace(s[4:])
	if rest == "" {
		return "", false
	}
	return rest, true
}

var mentionRECache sync.Map // key: botUserID string -> *regexp.Regexp

func stripLeadingBotMention(content, botUserID string) (rest string, ok bool) {
	if strings.TrimSpace(botUserID) == "" {
		return "", false
	}
	reAny, _ := mentionRECache.LoadOrStore(botUserID, regexp.MustCompile(`^\s*<@!?`+regexp.QuoteMeta(botUserID)+`>\s*`))
	re := reAny.(*regexp.Regexp)
	loc := re.FindStringIndex(content)
	if loc == nil || loc[0] != 0 {
		return "", false
	}
	rest = strings.TrimSpace(content[loc[1]:])
	if rest == "" {
		return "", false
	}
	return rest, true
}

func newMewUserHTTPClient() (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil // default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)

	if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
		proxyFunc, err := httpx.ProxyFuncFromString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
		}
		transport.Proxy = proxyFunc
	}

	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
	}, nil
}
