package syncx

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunInterval_NilFn_WaitsForContextDone(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		RunInterval(ctx, 1*time.Millisecond, true, nil)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected RunInterval to return after ctx done")
	}
}

func TestRunInterval_ImmediateAndTicks(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var n int32
	done := make(chan struct{})
	go func() {
		defer close(done)
		RunInterval(ctx, 5*time.Millisecond, true, func(ctx context.Context) {
			if atomic.AddInt32(&n, 1) >= 3 {
				cancel()
			}
		})
	}()

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for RunInterval to exit")
	}
	if atomic.LoadInt32(&n) < 3 {
		t.Fatalf("expected at least 3 invocations, got %d", n)
	}
}
