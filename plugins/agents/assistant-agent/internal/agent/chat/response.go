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

	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk"
	"mew/plugins/sdk/api/gateway/socketio"
)

type ProactiveDirective struct {
	DelaySeconds int    `json:"delay_seconds"`
	DelayMinutes int    `json:"delay_minutes"`
	Reason       string `json:"reason"`
}

type StickerDirective struct {
	Name string `json:"name"`
}

type ReplyControls struct {
	WantMore  bool
	Proactive *ProactiveDirective
	Sticker   *StickerDirective
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
		case t == config.AssistantWantMoreToken:
			controls.WantMore = true
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, config.AssistantProactiveTokenPrefix):
			// The model may emit this as a single line:
			//   <PROACTIVE>{"delay_seconds":180,"reason":"..."}
			raw := strings.TrimSpace(strings.TrimPrefix(t, config.AssistantProactiveTokenPrefix))
			if raw != "" && controls.Proactive == nil {
				var d ProactiveDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					if d.DelaySeconds < 0 {
						d.DelaySeconds = 0
					}
					if d.DelayMinutes < 0 {
						d.DelayMinutes = 0
					}
					d.Reason = strings.TrimSpace(d.Reason)
					controls.Proactive = &d
				}
			}
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, config.AssistantStickerTokenPrefix):
			raw := strings.TrimSpace(strings.TrimPrefix(t, config.AssistantStickerTokenPrefix))
			if raw != "" && controls.Sticker == nil {
				var d StickerDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					d.Name = strings.TrimSpace(d.Name)
					if d.Name != "" {
						controls.Sticker = &d
					}
				} else {
					// Best-effort fallback: treat the raw string as a name.
					rawName := strings.TrimSpace(raw)
					rawName = strings.Trim(rawName, "\"")
					if rawName != "" {
						controls.Sticker = &StickerDirective{Name: rawName}
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
	d := config.AssistantReplyDelayBase + time.Duration(n)*config.AssistantReplyDelayPerRune
	if d > config.AssistantReplyDelayMax {
		return config.AssistantReplyDelayMax
	}
	return d
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
	emit socketio.EmitFunc,
	channelID string,
	userID string,
	text string,
	logPrefix string,
	postMessageHTTP func(ctx context.Context, channelID, content string) error,
) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	sendErr := emit(config.AssistantUpstreamMessageCreate, map[string]any{
		"channelId": channelID,
		"content":   text,
	})
	if sendErr != nil {
		// Fallback: if the gateway is disconnected, use REST API.
		if postMessageHTTP == nil {
			return fmt.Errorf("send tool prelude failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postMessageHTTP not configured"))
		}
		if err := postMessageHTTP(ctx, channelID, text); err != nil {
			return fmt.Errorf("send tool prelude failed (gateway=%v http=%v)", sendErr, err)
		}
		log.Printf("%s gateway send prelude failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
	}
	return nil
}

func SendReply(
	ctx context.Context,
	emit socketio.EmitFunc,
	channelID string,
	userID string,
	reply string,
	controls ReplyControls,
	logPrefix string,
	postMessageHTTP func(ctx context.Context, channelID, content string) error,
	postStickerHTTP func(ctx context.Context, channelID, stickerID string) error,
	resolveStickerIDByName func(ctx context.Context, name string) (string, error),
) error {
	reply = strings.TrimSpace(reply)
	stickerName := ""
	if controls.Sticker != nil {
		stickerName = strings.TrimSpace(controls.Sticker.Name)
	}

	if reply == "" && stickerName == "" {
		log.Printf("%s empty reply: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}
	if strings.TrimSpace(reply) == config.AssistantSilenceToken || strings.Contains(reply, config.AssistantSilenceToken) {
		log.Printf("%s SILENCE: channel=%s user=%s", logPrefix, channelID, userID)
		return nil
	}

	if reply != "" {
		log.Printf("%s reply ready: channel=%s user=%s preview=%q",
			logPrefix, channelID, userID, sdk.PreviewString(reply, config.AssistantLogContentPreviewLen),
		)

		lines := make([]string, 0, config.AssistantMaxReplyLines)
		for _, line := range strings.Split(reply, "\n") {
			if len(lines) >= config.AssistantMaxReplyLines {
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
			sendErr := emit(config.AssistantUpstreamMessageCreate, map[string]any{
				"channelId": channelID,
				"content":   t,
			})
			if sendErr != nil {
				// Fallback: if the gateway is disconnected between reply generation and send, use REST API.
				if postMessageHTTP == nil {
					return fmt.Errorf("send message failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postMessageHTTP not configured"))
				}
				if err := postMessageHTTP(ctx, channelID, t); err != nil {
					return fmt.Errorf("send message failed (gateway=%v http=%v)", sendErr, err)
				}
				log.Printf("%s gateway send failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
			}
			linesSent++
			if i < len(lines)-1 {
				SleepWithContext(ctx, AssistantReplyDelayForLine(t))
			}
		}
		log.Printf("%s reply sent: channel=%s user=%s lines=%d", logPrefix, channelID, userID, linesSent)
	}

	if stickerName != "" {
		if resolveStickerIDByName == nil {
			return fmt.Errorf("resolveStickerIDByName not configured")
		}
		stickerID, err := resolveStickerIDByName(ctx, stickerName)
		if err != nil {
			return err
		}
		if strings.TrimSpace(stickerID) == "" {
			log.Printf("%s sticker not found in group: channel=%s user=%s name=%q", logPrefix, channelID, userID, stickerName)
			return nil
		}

		sendErr := emit(config.AssistantUpstreamMessageCreate, map[string]any{
			"channelId": channelID,
			"type":      "message/sticker",
			"payload": map[string]any{
				"stickerId":    stickerID,
				"stickerScope": "user",
			},
		})
		if sendErr != nil {
			if postStickerHTTP == nil {
				return fmt.Errorf("send sticker failed (gateway=%v http=%v)", sendErr, fmt.Errorf("postStickerHTTP not configured"))
			}
			if err := postStickerHTTP(ctx, channelID, stickerID); err != nil {
				return fmt.Errorf("send sticker failed (gateway=%v http=%v)", sendErr, err)
			}
			log.Printf("%s gateway sticker send failed, fallback to http ok: channel=%s user=%s err=%v", logPrefix, channelID, userID, sendErr)
		}
		log.Printf("%s sticker sent: channel=%s user=%s name=%q", logPrefix, channelID, userID, stickerName)
	}

	return nil
}

func PostMessageHTTP(ctx context.Context, httpClient *http.Client, apiBase string, channelID, content string) error {
	if httpClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(apiBase) == "" {
		return fmt.Errorf("missing api base")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return fmt.Errorf("missing channel id")
	}

	u := strings.TrimRight(apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
	body, _ := json.Marshal(map[string]any{"content": content})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
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

func PostStickerHTTP(ctx context.Context, httpClient *http.Client, apiBase string, channelID, stickerID string) error {
	if httpClient == nil {
		return fmt.Errorf("missing mew http client")
	}
	if strings.TrimSpace(apiBase) == "" {
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

	u := strings.TrimRight(apiBase, "/") + "/channels/" + url.PathEscape(channelID) + "/messages"
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

	resp, err := httpClient.Do(req)
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
