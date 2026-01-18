package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type engineIOOpen struct {
	PingInterval int `json:"pingInterval"`
	PingTimeout  int `json:"pingTimeout"`
}

func socketIOWebsocketURLFromAPIBase(apiBase string) (string, error) {
	apiBase = strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if apiBase == "" {
		return "", fmt.Errorf("empty apiBase")
	}

	// apiBase is typically `${MEW_URL}/api`.
	mewURL := strings.TrimSuffix(apiBase, "/api")
	mewURL = strings.TrimRight(mewURL, "/")

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
		return "", fmt.Errorf("invalid scheme: %q", u.Scheme)
	}

	u.Path = "/socket.io/"
	q := u.Query()
	q.Set("EIO", "4")
	q.Set("transport", "websocket")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func splitSocketIOFrames(msg []byte) [][]byte {
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

func RunInfraPresence(ctx context.Context, apiBase, adminSecret, serviceType, logPrefix string) {
	adminSecret = strings.TrimSpace(adminSecret)
	serviceType = strings.TrimSpace(serviceType)
	if adminSecret == "" || serviceType == "" {
		return
	}

	wsURL, err := socketIOWebsocketURLFromAPIBase(apiBase)
	if err != nil {
		log.Printf("%s infra presence disabled: %v", logPrefix, err)
		return
	}

	backoff := 500 * time.Millisecond
	for {
		if ctx.Err() != nil {
			return
		}

		dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
		conn, _, err := dialer.Dial(wsURL, http.Header{})
		if err != nil {
			timer := time.NewTimer(backoff)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}

		err = runInfraPresenceConn(ctx, conn, adminSecret, serviceType)
		_ = conn.Close()

		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if backoff < 10*time.Second {
			backoff *= 2
		}
		if err != nil && ctx.Err() == nil {
			log.Printf("%s infra presence disconnected: %v", logPrefix, err)
		}
	}
}

func runInfraPresenceConn(ctx context.Context, conn *websocket.Conn, adminSecret, serviceType string) error {
	var writeMu sync.Mutex
	sendText := func(payload string) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteMessage(websocket.TextMessage, []byte(payload))
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

	pingInterval := 25 * time.Second
	pingTimeout := 20 * time.Second
	connectedInfra := false

	for {
		deadline := time.Now().Add(pingInterval + pingTimeout + 10*time.Second)
		_ = conn.SetReadDeadline(deadline)
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		for _, frame := range splitSocketIOFrames(msg) {
			s := strings.TrimSpace(string(frame))
			if s == "" {
				continue
			}

			switch {
			case s == "2":
				if err := sendText("3"); err != nil {
					return err
				}
			case strings.HasPrefix(s, "0"):
				var open engineIOOpen
				_ = json.Unmarshal([]byte(s[1:]), &open)
				if open.PingInterval > 0 {
					pingInterval = time.Duration(open.PingInterval) * time.Millisecond
				}
				if open.PingTimeout > 0 {
					pingTimeout = time.Duration(open.PingTimeout) * time.Millisecond
				}

				auth, _ := json.Marshal(map[string]string{
					"adminSecret": adminSecret,
					"serviceType": serviceType,
				})
				if err := sendText("40/infra," + string(auth)); err != nil {
					return err
				}
			case strings.HasPrefix(s, "40/infra"):
				connectedInfra = true
			case strings.HasPrefix(s, "44/infra"):
				// Connect error.
				return fmt.Errorf("infra connect error: %s", s)
			case strings.HasPrefix(s, "41/infra"):
				// Namespace disconnect.
				return fmt.Errorf("infra namespace disconnected: %s", s)
			case s == "1":
				// Engine.IO close.
				return fmt.Errorf("engine.io closed")
			default:
				// Ignore other frames.
			}
		}

		if !connectedInfra {
			// Keep reading; connect ack may arrive later.
			continue
		}
	}
}
