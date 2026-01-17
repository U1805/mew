package socketio

import (
	"context"
	"errors"
	"time"
)

type ReconnectOptions struct {
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	OnDisconnect   func(err error, nextBackoff time.Duration)
}

type Session interface {
	Token(ctx context.Context) (string, error)
}

func RunGatewayWithReconnect(
	ctx context.Context,
	wsURL, token string,
	handler EventHandler,
	gatewayOpts GatewayOptions,
	reconnectOpts ReconnectOptions,
) error {
	return RunGatewayWithReconnectTokenProvider(
		ctx,
		wsURL,
		func(ctx context.Context) (string, error) { return token, nil },
		handler,
		gatewayOpts,
		reconnectOpts,
	)
}

func RunGatewayWithReconnectSession(
	ctx context.Context,
	wsURL string,
	session Session,
	handler EventHandler,
	gatewayOpts GatewayOptions,
	reconnectOpts ReconnectOptions,
) error {
	if session == nil {
		return errors.New("session is required")
	}
	return RunGatewayWithReconnectTokenProvider(ctx, wsURL, func(ctx context.Context) (string, error) {
		return session.Token(ctx)
	}, handler, gatewayOpts, reconnectOpts)
}

func RunGatewayWithReconnectTokenProvider(
	ctx context.Context,
	wsURL string,
	tokenProvider func(ctx context.Context) (string, error),
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

		token, err := tokenProvider(ctx)
		if err != nil {
			return err
		}
		err = RunGatewayOnce(ctx, wsURL, token, handler, gatewayOpts)
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
