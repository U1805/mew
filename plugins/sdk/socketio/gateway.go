package socketio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type EmitFunc func(event string, payload any) error

type EventHandler func(ctx context.Context, eventName string, payload json.RawMessage, emit EmitFunc) error

type GatewayOptions struct {
	HandshakeTimeout time.Duration
	ReadTimeout      time.Duration
	WriteTimeout     time.Duration
}

func (o GatewayOptions) withDefaults() GatewayOptions {
	if o.HandshakeTimeout <= 0 {
		o.HandshakeTimeout = 10 * time.Second
	}
	if o.ReadTimeout <= 0 {
		o.ReadTimeout = 60 * time.Second
	}
	if o.WriteTimeout <= 0 {
		o.WriteTimeout = 10 * time.Second
	}
	return o
}

func RunGatewayOnce(ctx context.Context, wsURL, token string, handler EventHandler, opts GatewayOptions) error {
	if strings.TrimSpace(wsURL) == "" {
		return fmt.Errorf("wsURL is required")
	}
	if handler == nil {
		return fmt.Errorf("handler is required")
	}

	opts = opts.withDefaults()

	dialer := websocket.Dialer{HandshakeTimeout: opts.HandshakeTimeout}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	var writeMu sync.Mutex
	sendText := func(payload string) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(opts.WriteTimeout))
		return conn.WriteMessage(websocket.TextMessage, []byte(payload))
	}

	emit := func(event string, payload any) error {
		frame, err := EmitFrame(event, payload)
		if err != nil {
			return err
		}
		return sendText(frame)
	}

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

	for {
		_ = conn.SetReadDeadline(time.Now().Add(opts.ReadTimeout))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return err
		}

		for _, frame := range SplitFrames(msg) {
			s := string(frame)
			if s == "" {
				continue
			}

			switch s[0] {
			case '0': // Engine.IO open
				authPayload, _ := json.Marshal(map[string]string{"token": token})
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
				if len(s) >= 2 && s[1] == '4' {
					return fmt.Errorf("socket.io error: %s", strings.TrimSpace(s))
				}
				if strings.HasPrefix(s, "42") {
					eventName, payload, ok, err := decodeEventPayload([]byte(s[2:]))
					if err != nil {
						return err
					}
					if !ok {
						continue
					}
					if err := handler(ctx, eventName, payload, emit); err != nil {
						return err
					}
				}
			default:
			}
		}
	}
}

func decodeEventPayload(raw []byte) (eventName string, payload json.RawMessage, ok bool, err error) {
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return "", nil, false, err
	}
	if len(arr) == 0 {
		return "", nil, false, nil
	}
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return "", nil, false, err
	}
	if strings.TrimSpace(eventName) == "" {
		return "", nil, false, nil
	}
	if len(arr) < 2 {
		return eventName, nil, true, nil
	}
	return eventName, arr[1], true, nil
}
