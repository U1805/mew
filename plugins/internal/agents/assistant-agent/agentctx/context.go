package agentctx

import (
	"context"
	"net/http"
	"time"

	"mew/plugins/internal/agents/assistant-agent/config"
	"mew/plugins/pkg/api/history"
)

// AssistantRequestContext is a per-request/per-run bundle for assistant-agent.
//
// It intentionally keeps only runtime dependencies (clients/config/fetcher, ids, logger prefix),
// so call chains can take a single parameter instead of passing a long list.
type AssistantRequestContext struct {
	Ctx       context.Context
	UserID    string
	ChannelID string
	LogPrefix string
	TimeLoc   *time.Location
	Persona   string

	LLM     LLMCallContext
	Mew     MewCallContext
	History HistoryCallContext
}

// LLMCallContext groups frequently co-traveled params used by LLM/tool calls.
// It is intended to be created per request/session and passed down the call chain.
type LLMCallContext struct {
	Ctx        context.Context
	HTTPClient *http.Client
	Config     config.AssistantConfig
}

// MewCallContext groups frequently co-traveled params used by MEW REST calls.
type MewCallContext struct {
	Ctx        context.Context
	HTTPClient *http.Client
	APIBase    string
}

// HistoryCallContext groups frequently co-traveled params used by history tools.
type HistoryCallContext struct {
	Ctx     context.Context
	Fetcher *history.Fetcher
	TimeLoc *time.Location
}

func ContextOrBackground(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}
