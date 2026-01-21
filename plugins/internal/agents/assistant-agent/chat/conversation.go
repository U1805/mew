package chat

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
)

type ConversationKey struct {
	ChannelID string
	UserID    string
}

type ConversationRequest struct {
	Ctx       context.Context
	Transport TransportContext

	// Run executes the LLM + parsing pipeline for the latest user message.
	// It should enqueue outbound messages via send/prelude callbacks.
	Run func(ctx context.Context, send func([]SendEvent), prelude func(string)) error
}

type ConversationCoordinator struct {
	key ConversationKey

	startOnce sync.Once
	parent    context.Context

	reqCh chan ConversationRequest
	sendQ *SendQueue
}

func NewConversationCoordinator(key ConversationKey) *ConversationCoordinator {
	key.ChannelID = strings.TrimSpace(key.ChannelID)
	key.UserID = strings.TrimSpace(key.UserID)
	return &ConversationCoordinator{
		key:   key,
		reqCh: make(chan ConversationRequest, 1),
		sendQ: NewSendQueue(),
	}
}

func (c *ConversationCoordinator) Submit(req ConversationRequest) {
	if req.Ctx == nil {
		req.Ctx = context.Background()
	}
	c.startOnce.Do(func() {
		c.parent = req.Ctx
		go c.run()
	})

	// Overwrite semantics: keep only the latest pending request.
	select {
	case c.reqCh <- req:
		return
	default:
	}
	select {
	case <-c.reqCh:
	default:
	}
	select {
	case c.reqCh <- req:
	default:
	}
}

func (c *ConversationCoordinator) run() {
	type inflight struct {
		cancel context.CancelFunc
		done   chan struct{}
	}

	var current *inflight
	var gen int64

	cancelAndWait := func() {
		if current == nil {
			return
		}
		cur := current
		current = nil
		cur.cancel()

		timer := time.NewTimer(3 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-cur.done:
				return
			case <-timer.C:
				log.Printf("%s waiting for cancellation: channel=%s user=%s", infra.AssistantLogPrefix, c.key.ChannelID, c.key.UserID)
				timer.Reset(3 * time.Second)
			}
		}
	}

	for {
		var req ConversationRequest
		select {
		case <-c.parent.Done():
			cancelAndWait()
			return
		case req = <-c.reqCh:
		}

		latest := req
	Drain:
		for {
			select {
			case next := <-c.reqCh:
				latest = next
			default:
				break Drain
			}
		}

		cancelAndWait()

		gen++
		runCtx, cancel := context.WithCancel(c.parent)
		done := make(chan struct{})
		current = &inflight{cancel: cancel, done: done}

		c.sendQ.Reset(runCtx, gen, latest.Transport)

		go func(req ConversationRequest, generation int64) {
			defer close(done)
			if req.Run == nil {
				return
			}
			_ = req.Run(runCtx,
				func(events []SendEvent) { c.sendQ.Enqueue(generation, events) },
				func(text string) { c.sendQ.EnqueueToolPrelude(generation, text) },
			)
		}(latest, gen)

		select {
		case <-done:
			current = nil
		case next := <-c.reqCh:
			// A newer user message arrived: cancel the current run, then continue with the newest.
			select {
			case c.reqCh <- next:
			default:
				select {
				case <-c.reqCh:
				default:
				}
				select {
				case c.reqCh <- next:
				default:
				}
			}
			cancelAndWait()
		}
	}
}

type sendBatch struct {
	gen    int64
	events []SendEvent
}

type SendQueue struct {
	mu sync.RWMutex

	gen       int64
	ctx       context.Context
	cancel    context.CancelFunc
	transport TransportContext

	ch chan sendBatch
}

func NewSendQueue() *SendQueue {
	q := &SendQueue{
		ch: make(chan sendBatch, 256),
	}
	go q.run()
	return q
}

func (q *SendQueue) Reset(ctx context.Context, gen int64, transport TransportContext) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.cancel != nil {
		q.cancel()
	}
	sendCtx, cancel := context.WithCancel(ctx)
	q.ctx = sendCtx
	q.cancel = cancel
	q.gen = gen
	q.transport = transport
}

func (q *SendQueue) Enqueue(gen int64, events []SendEvent) {
	if len(events) == 0 {
		return
	}
	b := sendBatch{gen: gen, events: events}
	select {
	case q.ch <- b:
		return
	default:
		select {
		case <-q.ch:
		default:
		}
		select {
		case q.ch <- b:
		default:
		}
	}
}

func (q *SendQueue) EnqueueToolPrelude(gen int64, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	q.Enqueue(gen, []SendEvent{{Kind: ReplyPartText, Text: text, Immediate: true}})
}

func (q *SendQueue) run() {
	for b := range q.ch {
		q.mu.RLock()
		currentGen := q.gen
		ctx := q.ctx
		transport := q.transport
		q.mu.RUnlock()

		if b.gen != currentGen || ctx == nil {
			continue
		}
		if err := SendEvents(ctx, transport, b.events); err != nil {
			if ctx.Err() != nil {
				continue
			}
			log.Printf("%s send failed: channel=%s user=%s err=%v", infra.AssistantLogPrefix, transport.ChannelID, transport.UserID, err)
		}
	}
}
