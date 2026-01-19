package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/pkg"
	"mew/plugins/pkg/api/gateway/socketio"
)

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
	WantMore  bool
	Proactive *ProactiveDirective
	Sticker   *StickerDirective
	Voice     *VoiceDirective
}

type TransportContext struct {
	Emit      socketio.EmitFunc
	ChannelID string
	UserID    string
	LogPrefix string
	TypingWPM int

	PostMessageHTTP        func(ctx context.Context, channelID, content string) error
	PostStickerHTTP        func(ctx context.Context, channelID, stickerID string) error
	SendVoiceHTTP          func(ctx context.Context, channelID, text string) error
	ResolveStickerIDByName func(ctx context.Context, name string) (string, error)
}

func ParseReplyControls(reply string) (clean string, controls ReplyControls) {
	lines := strings.Split(strings.ReplaceAll(reply, "\r\n", "\n"), "\n")

	for {
		last := -1
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) != "" {
				last = i
				break
			}
		}
		if last < 0 {
			break
		}

		t := strings.TrimSpace(lines[last])
		switch {
		case t == infra.AssistantWantMoreToken:
			controls.WantMore = true
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, infra.AssistantProactiveTokenPrefix):
			// The model may emit this as a single line:
			//   <PROACTIVE>{"delay_seconds":180,"reason":"..."}
			raw := strings.TrimSpace(strings.TrimPrefix(t, infra.AssistantProactiveTokenPrefix))
			if raw != "" && controls.Proactive == nil {
				var d ProactiveDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					if d.DelaySeconds < 0 {
						d.DelaySeconds = 0
					}
					d.Reason = strings.TrimSpace(d.Reason)
					controls.Proactive = &d
				}
			}
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, infra.AssistantStickerTokenPrefix):
			raw := strings.TrimSpace(strings.TrimPrefix(t, infra.AssistantStickerTokenPrefix))
			if raw != "" && controls.Sticker == nil {
				var d StickerDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					d.Name = strings.TrimSpace(d.Name)
					if d.Name != "" {
						controls.Sticker = &d
					}
				}
			}
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, infra.AssistantVoiceTokenPrefix):
			raw := strings.TrimSpace(strings.TrimPrefix(t, infra.AssistantVoiceTokenPrefix))
			if raw != "" && controls.Voice == nil {
				var d VoiceDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					d.Text = strings.TrimSpace(d.Text)
					if d.Text != "" {
						controls.Voice = &d
					}
				}
			}
			lines = append(lines[:last], lines[last+1:]...)
			continue
		default:
			// Stop when the last non-empty line is not a control directive.
		}
		break
	}

	clean = strings.TrimSpace(strings.Join(lines, "\n"))
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
	reply = strings.TrimSpace(reply)
	stickerName := ""
	if controls.Sticker != nil {
		stickerName = strings.TrimSpace(controls.Sticker.Name)
	}
	voiceText := ""
	if controls.Voice != nil {
		voiceText = strings.TrimSpace(controls.Voice.Text)
	}

	if reply == "" && stickerName == "" && voiceText == "" {
		log.Printf("%s empty reply: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
		return nil
	}
	if strings.TrimSpace(reply) == infra.AssistantSilenceToken || strings.Contains(reply, infra.AssistantSilenceToken) {
		log.Printf("%s SILENCE: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
		return nil
	}

	typingWPM := c.TypingWPM
	if typingWPM <= 0 {
		typingWPM = infra.AssistantTypingWPMDefault
	}

	if reply != "" {
		log.Printf("%s reply ready: channel=%s user=%s preview=%q",
			c.LogPrefix, c.ChannelID, c.UserID, sdk.PreviewString(reply, infra.AssistantLogContentPreviewLen),
		)

		lines := make([]string, 0, infra.AssistantMaxReplyLines)
		for _, line := range strings.Split(reply, "\n") {
			if len(lines) >= infra.AssistantMaxReplyLines {
				break
			}
			t := strings.TrimSpace(line)
			if t == "" {
				continue
			}
			lines = append(lines, t)
		}

		linesSent := 0
		for i, t := range lines {
			SleepWithContext(ctx, AssistantTypingDelayForLine(t, typingWPM))
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
			if i < len(lines)-1 {
				SleepWithContext(ctx, AssistantReplyDelayForLine(t))
			}
		}
		log.Printf("%s reply sent: channel=%s user=%s lines=%d", c.LogPrefix, c.ChannelID, c.UserID, linesSent)
	}

	if voiceText != "" {
		if c.SendVoiceHTTP == nil {
			return fmt.Errorf("sendVoiceHTTP not configured")
		}
		if err := c.SendVoiceHTTP(ctx, c.ChannelID, voiceText); err != nil {
			return err
		}
		log.Printf("%s voice sent: channel=%s user=%s", c.LogPrefix, c.ChannelID, c.UserID)
	}

	if stickerName != "" {
		if c.ResolveStickerIDByName == nil {
			return fmt.Errorf("resolveStickerIDByName not configured")
		}
		stickerID, err := c.ResolveStickerIDByName(ctx, stickerName)
		if err != nil {
			return err
		}
		if strings.TrimSpace(stickerID) == "" {
			log.Printf("%s sticker not found in group: channel=%s user=%s name=%q", c.LogPrefix, c.ChannelID, c.UserID, stickerName)
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
		log.Printf("%s sticker sent: channel=%s user=%s name=%q", c.LogPrefix, c.ChannelID, c.UserID, stickerName)
	}

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
