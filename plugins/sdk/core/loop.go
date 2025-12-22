package core

import (
	"context"
	"time"
)

// RunInterval runs fn immediately (if immediate=true) and then on every tick.
// It returns when ctx is done.
func RunInterval(ctx context.Context, interval time.Duration, immediate bool, fn func(ctx context.Context)) {
	if ctx == nil {
		ctx = context.Background()
	}
	if fn == nil {
		<-ctx.Done()
		return
	}
	if interval <= 0 {
		interval = time.Second
	}

	if immediate {
		fn(ctx)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fn(ctx)
		}
	}
}
