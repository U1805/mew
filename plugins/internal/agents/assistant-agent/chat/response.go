package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/pkg/api/gateway/socketio"
)

var finalMoodTokenRe = regexp.MustCompile(`(?is)\bfinal_mood\s*:`)

type ProactiveDirective struct {
	DelaySeconds int    `json:"delay_seconds"`
	Reason       string `json:"reason"`
}

type StickerDirective struct {
	Name string `json:"name"`
}

type VoiceDirective struct {
	Text string `json:"text"`
}

type ReplyControls struct {
	Silence   bool
	WantMore  bool
	Proactive *ProactiveDirective
	Sticker   *StickerDirective
	Stickers  []StickerDirective
	Parts     []ReplyPart
	Voice     *VoiceDirective
	Voices    []VoiceDirective
}

type ReplyPartKind string

const (
	ReplyPartText    ReplyPartKind = "text"
	ReplyPartSticker ReplyPartKind = "sticker"
	ReplyPartVoice   ReplyPartKind = "voice"
)

type ReplyPart struct {
	Kind ReplyPartKind
	Text string

	StickerName string
	VoiceText   string
}

type PreparedVoice struct {
	TempPath    string
	Filename    string
	ContentType string
	PlainText   string
}

type VoiceFuture struct {
	done chan struct{}

	mu       sync.Mutex
	resolved bool
	prepared *PreparedVoice
	err      error
}

func NewVoiceFuture() *VoiceFuture {
	return &VoiceFuture{done: make(chan struct{})}
}

func (f *VoiceFuture) Resolve(prepared *PreparedVoice, err error) {
	if f == nil {
		return
	}
	f.mu.Lock()
	if f.resolved {
		f.mu.Unlock()
		return
	}
	f.prepared = prepared
	f.err = err
	f.resolved = true
	close(f.done)
	f.mu.Unlock()
}

func (f *VoiceFuture) Wait(ctx context.Context) (*PreparedVoice, error) {
	if f == nil {
		return nil, fmt.Errorf("voice future is nil")
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-f.done:
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.prepared, f.err
}

// SendEvent is a parsed outbound message chunk (text / sticker / voice).
// It is used by the assistant-agent send queue to stream replies while supporting cancellation.
type SendEvent struct {
	Kind ReplyPartKind

	// Text is used when Kind==ReplyPartText.
	Text string

	// StickerName is used when Kind==ReplyPartSticker.
	StickerName string

	// VoiceText is used when Kind==ReplyPartVoice.
	VoiceText string
	// VoiceFuture is an optional prefetch handle for Kind==ReplyPartVoice.
	// When present, SendEvents will wait for it and upload the prepared audio (if supported).
	VoiceFuture *VoiceFuture

	// Immediate skips typing simulation + inter-line delay for this event.
	// Useful for "tool prelude" messages that should appear instantly.
	Immediate bool
}

type TransportContext struct {
	Emit      socketio.EmitFunc
	ChannelID string
	UserID    string
	LogPrefix string
	TypingWPM int
	// Sleep overrides SleepWithContext for delay simulation (useful for tests).
	Sleep func(ctx context.Context, d time.Duration)

	PostMessageHTTP        func(ctx context.Context, channelID, content string) error
	PostStickerHTTP        func(ctx context.Context, channelID, stickerID string) error
	SendVoiceHTTP          func(ctx context.Context, channelID, text string) error
	SendVoicePreparedHTTP  func(ctx context.Context, channelID string, v PreparedVoice) error
	ResolveStickerIDByName func(ctx context.Context, name string) (string, error)

	// StickerSendProbability overrides infra.AssistantStickerSendProbability when non-nil.
	StickerSendProbability *float64
	// StickerSendRandom overrides rand.Float64 when non-nil (useful for tests).
	StickerSendRandom func() float64
}

func ParseReplyControls(reply string) (clean string, controls ReplyControls) {
	s := strings.ReplaceAll(reply, "\r\n", "\n")

	// If the model explicitly ends with <SILENCE>, treat it as a "send nothing" directive.
	// This is stricter than the truncation safeguard below, which exists to prevent protocol leakage.
	if strings.HasSuffix(strings.TrimSpace(s), infra.AssistantSilenceToken) {
		return "", ReplyControls{Silence: true}
	}

	// Sometimes the model mistakenly emits control tokens in the middle. Once we see one,
	// we truncate the rest so we don't accidentally send any content after it.
	cutAt := -1
	if i := strings.Index(s, infra.AssistantSilenceToken); i >= 0 && (cutAt < 0 || i < cutAt) {
		cutAt = i
	}
	if i := strings.Index(s, infra.AssistantWantMoreToken); i >= 0 && (cutAt < 0 || i < cutAt) {
		cutAt = i
	}
	if i := strings.Index(s, infra.AssistantToolCallTokenPrefix); i >= 0 && (cutAt < 0 || i < cutAt) {
		cutAt = i
	}
	if i := strings.Index(s, "</TOOL>"); i >= 0 && (cutAt < 0 || i < cutAt) {
		cutAt = i
	}
	if loc := finalMoodTokenRe.FindStringIndex(s); loc != nil && (cutAt < 0 || loc[0] < cutAt) {
		cutAt = loc[0]
	}
	if cutAt >= 0 {
		if strings.HasPrefix(s[cutAt:], infra.AssistantWantMoreToken) {
			controls.WantMore = true
		}
		s = s[:cutAt]
	}

	type tok struct {
		prefix string
		kind   ReplyPartKind
	}
	toks := []tok{
		{prefix: infra.AssistantProactiveTokenPrefix, kind: ""},
		{prefix: infra.AssistantStickerTokenPrefix, kind: ReplyPartSticker},
		{prefix: infra.AssistantVoiceTokenPrefix, kind: ReplyPartVoice},
	}

	parseJSONObject := func(s string, start int) (objText string, end int, ok bool) {
		i := start
		for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
		if i >= len(s) || s[i] != '{' {
			return "", start, false
		}
		depth := 0
		for j := i; j < len(s); j++ {
			switch s[j] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					return s[i : j+1], j + 1, true
				}
			}
		}
		return "", start, false
	}

	var parts []ReplyPart
	var textBuf strings.Builder
	flushText := func() {
		if textBuf.Len() == 0 {
			return
		}
		parts = append(parts, ReplyPart{Kind: ReplyPartText, Text: textBuf.String()})
		textBuf.Reset()
	}

	for i := 0; i < len(s); {
		nextPos := -1
		var next tok
		for _, t := range toks {
			if t.prefix == "" {
				continue
			}
			p := strings.Index(s[i:], t.prefix)
			if p < 0 {
				continue
			}
			p += i
			if nextPos < 0 || p < nextPos {
				nextPos = p
				next = t
			}
		}
		if nextPos < 0 {
			textBuf.WriteString(s[i:])
			break
		}

		textBuf.WriteString(s[i:nextPos])
		i = nextPos + len(next.prefix)

		obj, end, ok := parseJSONObject(s, i)
		if !ok {
			// Malformed directive: drop the token prefix and continue.
			continue
		}
		i = end

		switch next.kind {
		case ReplyPartSticker:
			var d StickerDirective
			if json.Unmarshal([]byte(obj), &d) == nil {
				d.Name = strings.TrimSpace(d.Name)
				if d.Name != "" {
					// Only the first sticker directive is allowed to produce an outbound sticker.
					// Later stickers are discarded (but still removed from the text stream).
					if controls.Sticker == nil {
						controls.Sticker = &StickerDirective{Name: d.Name}
						controls.Stickers = append(controls.Stickers, d)
						flushText()
						parts = append(parts, ReplyPart{Kind: ReplyPartSticker, StickerName: d.Name})
					}
				}
			}
		case ReplyPartVoice:
			var d VoiceDirective
			if json.Unmarshal([]byte(obj), &d) == nil {
				d.Text = strings.TrimSpace(d.Text)
				if d.Text != "" {
					// Only the first voice directive is allowed to produce an outbound voice message.
					// Later voices are discarded (but still removed from the text stream).
					if controls.Voice == nil {
						controls.Voice = &VoiceDirective{Text: d.Text}
						controls.Voices = append(controls.Voices, VoiceDirective{Text: d.Text})
						flushText()
						parts = append(parts, ReplyPart{Kind: ReplyPartVoice, VoiceText: d.Text})
					}
				}
			}
		default:
			if next.prefix == infra.AssistantProactiveTokenPrefix {
				if controls.Proactive == nil {
					var d ProactiveDirective
					if json.Unmarshal([]byte(obj), &d) == nil {
						if d.DelaySeconds < 0 {
							d.DelaySeconds = 0
						}
						d.Reason = strings.TrimSpace(d.Reason)
						controls.Proactive = &d
					}
				}
			}
		}
	}
	flushText()
	controls.Parts = parts

	// Build clean text for downstream logic (e.g. proactive pipeline).
	var cleanBuf strings.Builder
	for _, p := range parts {
		if p.Kind == ReplyPartText {
			cleanBuf.WriteString(p.Text)
		}
	}
	lines := strings.Split(strings.ReplaceAll(cleanBuf.String(), "\r\n", "\n"), "\n")
	outLines := make([]string, 0, len(lines))
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		outLines = append(outLines, t)
	}
	clean = strings.TrimSpace(strings.Join(outLines, "\n"))
	return clean, controls
}

func AssistantReplyDelayForLine(line string) time.Duration {
	n := len([]rune(strings.TrimSpace(line)))
	if n <= 0 {
		return 0
	}
	d := infra.AssistantReplyDelayBase + time.Duration(n)*infra.AssistantReplyDelayPerRune
	if d > infra.AssistantReplyDelayMax {
		return infra.AssistantReplyDelayMax
	}
	return d
}

func AssistantTypingDelayForLine(line string, wpm int) time.Duration {
	n := len([]rune(strings.TrimSpace(line)))
	if n <= 0 {
		return 0
	}
	if wpm <= 0 {
		wpm = infra.AssistantTypingWPMDefault
	}
	if wpm <= 0 {
		return 0
	}
	return time.Duration(n) * time.Minute / time.Duration(wpm)
}

func AssistantTypingDelayForLineMaybeSkipFirst(line string, wpm int, isFirstMessage bool) time.Duration {
	effectiveWPM := wpm
	if effectiveWPM <= 0 {
		effectiveWPM = infra.AssistantTypingWPMDefault
	}
	if isFirstMessage && effectiveWPM == infra.AssistantTypingWPMDefault {
		return 0
	}
	return AssistantTypingDelayForLine(line, effectiveWPM)
}

func SleepWithContext(ctx context.Context, d time.Duration) {
	if d <= 0 {
		return
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return
	case <-t.C:
		return
	}
}

func SendToolPrelude(
	ctx context.Context,
	c TransportContext,
	text string,
) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	var sendErr error
	if c.Emit == nil {
		sendErr = fmt.Errorf("emit not configured")
	} else {
		sendErr = c.Emit(infra.AssistantUpstreamMessageCreate, map[string]any{
			"channelId": c.ChannelID,
			"content":   text,
		})
	}
	if sendErr != nil {
		// Fallback: if the gateway is disconnected, use REST API.
		if c.PostMessageHTTP == nil {
			return fmt.Errorf("send tool prelude failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postMessageHTTP not configured"))
		}
		if err := c.PostMessageHTTP(ctx, c.ChannelID, text); err != nil {
			return fmt.Errorf("send tool prelude failed (gateway=%v http=%v)", sendErr, err)
		}
		log.Printf("%s gateway send prelude failed, fallback to http ok: channel=%s user=%s err=%v", c.LogPrefix, c.ChannelID, c.UserID, sendErr)
	}
	return nil
}

func SendReply(
	ctx context.Context,
	c TransportContext,
	reply string,
	controls ReplyControls,
) error {
	if controls.Silence {
		log.Printf("%s SILENCE: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
		return nil
	}

	events := BuildSendEvents(reply, controls)
	return SendEvents(ctx, c, events)
}

func BuildSendEvents(reply string, controls ReplyControls) []SendEvent {
	reply = strings.TrimSpace(reply)
	stickerName := ""
	if controls.Sticker != nil {
		stickerName = strings.TrimSpace(controls.Sticker.Name)
	}
	voiceText := ""
	if len(controls.Parts) == 0 && controls.Voice != nil {
		voiceText = strings.TrimSpace(controls.Voice.Text)
	}

	if reply == "" && stickerName == "" && voiceText == "" && len(controls.Stickers) == 0 && len(controls.Voices) == 0 {
		return nil
	}
	if strings.TrimSpace(reply) == infra.AssistantSilenceToken || strings.Contains(reply, infra.AssistantSilenceToken) {
		return nil
	}

	var events []SendEvent
	if reply != "" || len(controls.Parts) != 0 {
		if len(controls.Parts) == 0 {
			for _, line := range strings.Split(reply, "\n") {
				if len(events) >= infra.AssistantMaxReplyLines {
					break
				}
				t := strings.TrimSpace(line)
				if t == "" {
					continue
				}
				events = append(events, SendEvent{Kind: ReplyPartText, Text: t})
			}
		} else {
			for _, part := range controls.Parts {
				if len(events) >= infra.AssistantMaxReplyLines {
					break
				}
				switch part.Kind {
				case ReplyPartSticker:
					events = append(events, SendEvent{Kind: ReplyPartSticker, StickerName: part.StickerName})
				case ReplyPartVoice:
					events = append(events, SendEvent{Kind: ReplyPartVoice, VoiceText: part.VoiceText})
				case ReplyPartText:
					for _, line := range strings.Split(strings.ReplaceAll(part.Text, "\r\n", "\n"), "\n") {
						if len(events) >= infra.AssistantMaxReplyLines {
							break
						}
						t := strings.TrimSpace(line)
						if t == "" {
							continue
						}
						events = append(events, SendEvent{Kind: ReplyPartText, Text: t})
					}
				default:
				}
			}
		}
	}

	if voiceText != "" {
		events = append(events, SendEvent{Kind: ReplyPartVoice, VoiceText: voiceText})
	}

	// Back-compat: if a sticker directive exists but wasn't emitted as part of the stream, send it at the end.
	if stickerName != "" && len(controls.Parts) == 0 {
		events = append(events, SendEvent{Kind: ReplyPartSticker, StickerName: stickerName})
	}

	return events
}

func SendEvents(ctx context.Context, c TransportContext, events []SendEvent) error {
	if len(events) == 0 {
		log.Printf("%s empty reply: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
		return nil
	}
	log.Printf("%s reply ready: channel=%s user=%s events=%d", c.LogPrefix, c.ChannelID, c.UserID, len(events))

	sendStickerByName := func(name string) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		name = strings.TrimSpace(name)
		if name == "" {
			return nil
		}

		p := infra.AssistantStickerSendProbability
		if c.StickerSendProbability != nil {
			p = *c.StickerSendProbability
		}
		if p >= 0 && p < 1 {
			r := rand.Float64
			if c.StickerSendRandom != nil {
				r = c.StickerSendRandom
			}
			if r() >= p {
				log.Printf("%s sticker intercepted: channel=%s user=%s name=%q", c.LogPrefix, c.ChannelID, c.UserID, name)
				return nil
			}
		}

		if c.ResolveStickerIDByName == nil {
			return fmt.Errorf("resolveStickerIDByName not configured")
		}
		stickerID, err := c.ResolveStickerIDByName(ctx, name)
		if err != nil {
			return err
		}
		if strings.TrimSpace(stickerID) == "" {
			log.Printf("%s sticker not found in group: channel=%s user=%s name=%q", c.LogPrefix, c.ChannelID, c.UserID, name)
			return nil
		}

		var sendErr error
		if c.Emit == nil {
			sendErr = fmt.Errorf("emit not configured")
		} else {
			sendErr = c.Emit(infra.AssistantUpstreamMessageCreate, map[string]any{
				"channelId": c.ChannelID,
				"type":      "message/sticker",
				"payload": map[string]any{
					"stickerId":    stickerID,
					"stickerScope": "user",
				},
			})
		}
		if sendErr != nil {
			if c.PostStickerHTTP == nil {
				return fmt.Errorf("send sticker failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postStickerHTTP not configured"))
			}
			if err := c.PostStickerHTTP(ctx, c.ChannelID, stickerID); err != nil {
				return fmt.Errorf("send sticker failed (gateway=%v http=%v)", sendErr, err)
			}
			log.Printf("%s gateway sticker send failed, fallback to http ok: channel=%s user=%s err=%v", c.LogPrefix, c.ChannelID, c.UserID, sendErr)
		}
		log.Printf("%s sticker sent: channel=%s user=%s name=%q", c.LogPrefix, c.ChannelID, c.UserID, name)
		return nil
	}

	typingWPM := c.TypingWPM
	if typingWPM <= 0 {
		typingWPM = infra.AssistantTypingWPMDefault
	}

	sleep := c.Sleep
	if sleep == nil {
		sleep = SleepWithContext
	}

	linesSent := 0
	for i, ev := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		switch ev.Kind {
		case ReplyPartSticker:
			if err := sendStickerByName(ev.StickerName); err != nil {
				return err
			}
		case ReplyPartVoice:
			if ev.VoiceFuture != nil && c.SendVoicePreparedHTTP != nil {
				v, err := ev.VoiceFuture.Wait(ctx)
				if err != nil {
					return err
				}
				if v != nil {
					if err := c.SendVoicePreparedHTTP(ctx, c.ChannelID, *v); err != nil {
						return err
					}
					log.Printf("%s voice sent: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
					continue
				}
			}
			if c.SendVoiceHTTP == nil {
				return fmt.Errorf("sendVoiceHTTP not configured")
			}
			if err := c.SendVoiceHTTP(ctx, c.ChannelID, ev.VoiceText); err != nil {
				return err
			}
			log.Printf("%s voice sent: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
		case ReplyPartText:
			t := strings.TrimSpace(ev.Text)
			if t == "" {
				continue
			}

			delay := time.Duration(0)
			if !ev.Immediate {
				delay = AssistantTypingDelayForLineMaybeSkipFirst(t, typingWPM, linesSent == 0)
				// If the next event is non-text (voice/sticker), don't hold it back with typing simulation.
				if i < len(events)-1 && (events[i+1].Kind == ReplyPartVoice || events[i+1].Kind == ReplyPartSticker) {
					delay = 0
				}
			}
			sleep(ctx, delay)

			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			var sendErr error
			if c.Emit == nil {
				sendErr = fmt.Errorf("emit not configured")
			} else {
				sendErr = c.Emit(infra.AssistantUpstreamMessageCreate, map[string]any{
					"channelId": c.ChannelID,
					"content":   t,
				})
			}
			if sendErr != nil {
				// Fallback: if the gateway is disconnected between reply generation and send, use REST API.
				if c.PostMessageHTTP == nil {
					return fmt.Errorf("send message failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postMessageHTTP not configured"))
				}
				if err := c.PostMessageHTTP(ctx, c.ChannelID, t); err != nil {
					return fmt.Errorf("send message failed (gateway=%v http=%v)", sendErr, err)
				}
				log.Printf("%s gateway send failed, fallback to http ok: channel=%s user=%s err=%v", c.LogPrefix, c.ChannelID, c.UserID, sendErr)
			}
			linesSent++
			// Keep the "pause between text lines" behavior, but don't delay before a sticker/voice.
			if !ev.Immediate && i < len(events)-1 && events[i+1].Kind == ReplyPartText {
				sleep(ctx, AssistantReplyDelayForLine(t))
			}
		default:
		}
	}
	log.Printf("%s reply sent: channel=%s user=%s lines=%d", c.LogPrefix, c.ChannelID, c.UserID, linesSent)
	return nil
}

func PostMessageHTTP(c infra.MewCallContext, channelID, content string) error {
	ctx := infra.ContextOrBackground(c.Ctx)

	if c.HTTPClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(c.APIBase) == "" {
		return fmt.Errorf("missing api base")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return fmt.Errorf("missing channel id")
	}

	u := strings.TrimRight(c.APIBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	body, _ := json.Marshal(map[string]any{"content": content})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func PostStickerHTTP(c infra.MewCallContext, channelID, stickerID string) error {
	ctx := infra.ContextOrBackground(c.Ctx)

	if c.HTTPClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(c.APIBase) == "" {
		return fmt.Errorf("missing api base")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return fmt.Errorf("missing channel id")
	}
	stickerID = strings.TrimSpace(stickerID)
	if stickerID == "" {
		return fmt.Errorf("missing sticker id")
	}

	u := strings.TrimRight(c.APIBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	body, _ := json.Marshal(map[string]any{
		"type": "message/sticker",
		"payload": map[string]any{
			"stickerId":    stickerID,
			"stickerScope": "user",
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}
