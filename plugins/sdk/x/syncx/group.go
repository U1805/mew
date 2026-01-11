package syncx

import (
	"context"
	"sync"
)

// Group is a small helper for running multiple goroutines with shared cancellation
// and a single Stop() method that waits for all goroutines to exit.
type Group struct {
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewGroup(parent context.Context) *Group {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &Group{ctx: ctx, cancel: cancel}
}

func (g *Group) Context() context.Context { return g.ctx }

func (g *Group) Go(fn func(ctx context.Context)) {
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		fn(g.ctx)
	}()
}

func (g *Group) Wait() {
	g.wg.Wait()
}

func (g *Group) Stop() {
	g.cancel()
	g.wg.Wait()
}
