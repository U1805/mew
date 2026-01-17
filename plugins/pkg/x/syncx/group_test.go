package syncx

import (
	"context"
	"testing"
	"time"
)

func TestGroup_StopCancelsAndWaits(t *testing.T) {
	t.Parallel()

	g := NewGroup(nil)

	done := make(chan struct{})
	g.Go(func(ctx context.Context) {
		<-ctx.Done()
		close(done)
	})

	g.Stop()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected goroutine to exit after Stop")
	}
}

func TestGroup_Wait(t *testing.T) {
	t.Parallel()

	g := NewGroup(context.Background())

	ch := make(chan struct{})
	g.Go(func(ctx context.Context) { close(ch) })

	g.Wait()
	select {
	case <-ch:
	default:
		t.Fatalf("expected goroutine to finish before Wait returns")
	}
}
