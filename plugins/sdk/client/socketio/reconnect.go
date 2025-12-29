package socketio

import (
	"context"
	"time"
)

type ReconnectOptions struct {
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	OnDisconnect   func(err error, nextBackoff time.Duration)
}

func RunGatewayWithReconnect(
	ctx context.Context,
	wsURL, token string,
	handler EventHandler,
	gatewayOpts GatewayOptions,
	reconnectOpts ReconnectOptions,
) error {
	backoff := reconnectOpts.InitialBackoff
	if backoff <= 0 {
		backoff = 500 * time.Millisecond
	}

	maxBackoff := reconnectOpts.MaxBackoff
	if maxBackoff <= 0 {
		maxBackoff = 10 * time.Second
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		err := RunGatewayOnce(ctx, wsURL, token, handler, gatewayOpts)
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if reconnectOpts.OnDisconnect != nil {
			reconnectOpts.OnDisconnect(err, backoff)
		}

		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}

		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}
