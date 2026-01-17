package utils

import (
	"context"
	"log"
	"strings"
	"time"

	"mew/plugins/pkg/x/llm"
)

// CognitiveRetryOptions 配置“认知类 LLM 调用”的重试策略（事实抽取/记忆整理/摘要等）。
//
// 这些调用会受到网络与上游服务波动影响；带抖动的指数退避可以降低瞬时错误率并避免打爆上游。
type CognitiveRetryOptions struct {
	MaxRetries     int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	LogPrefix      string
	ChannelID      string
}

func (o CognitiveRetryOptions) withDefaults() CognitiveRetryOptions {
	if o.MaxRetries <= 0 {
		o.MaxRetries = 5
	}
	if o.InitialBackoff <= 0 {
		o.InitialBackoff = 250 * time.Millisecond
	}
	if o.MaxBackoff <= 0 {
		o.MaxBackoff = 5 * time.Second
	}
	return o
}

// RetryCognitive 按 CognitiveRetryOptions 对 fn 进行重试（抖动 + 指数退避）。
//
// - fn 返回 nil 则立即成功返回
// - 若重试耗尽则返回最后一次错误
// - 若 ctx 被取消则提前退出并返回 ctx.Err()
func RetryCognitive(ctx context.Context, opts CognitiveRetryOptions, fn func() error) error {
	opts = opts.withDefaults()

	var lastErr error
	for attempt := 0; attempt < opts.MaxRetries; attempt++ {
		if err := fn(); err == nil {
			return nil
		} else {
			lastErr = err
		}

		if attempt >= opts.MaxRetries-1 {
			return lastErr
		}

		backoff := llm.WithJitter(llm.ExpBackoff(attempt, opts.InitialBackoff, opts.MaxBackoff))
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm transient failure: channel=%s retry=%d/%d err=%v backoff=%s",
				opts.LogPrefix, opts.ChannelID, attempt+1, opts.MaxRetries, lastErr, backoff,
			)
		}
		if !llm.SleepWithContext(ctx, backoff) {
			return ctx.Err()
		}
	}
	return lastErr
}
