package socketio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
)

func WebsocketURL(mewURL string) (string, error) {
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

func SplitFrames(msg []byte) [][]byte {
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

func EmitFrame(event string, payload any) (string, error) {
	frame, err := json.Marshal([]any{event, payload})
	if err != nil {
		return "", err
	}
	return "42" + string(frame), nil
}

var mentionRECache sync.Map // key: botUserID string -> *regexp.Regexp

func StripLeadingBotMention(content, botUserID string) (rest string, ok bool) {
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
	return rest, true
}
