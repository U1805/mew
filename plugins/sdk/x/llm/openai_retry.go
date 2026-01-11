package llm

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"
)

type CallOpenAIChatCompletionWithRetryOptions struct {
	MaxRetries     int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	LogPrefix      string
	ChannelID      string
}

func CallOpenAIChatCompletionWithRetry(
	ctx context.Context,
	httpClient *http.Client,
	cfg OpenAIChatConfig,
	messages []openaigo.ChatCompletionMessageParamUnion,
	tools []openaigo.ChatCompletionToolUnionParam,
	opts CallOpenAIChatCompletionWithRetryOptions,
) (*openaigo.ChatCompletion, error) {
	if opts.MaxRetries <= 0 {
		opts.MaxRetries = 5
	}
	if opts.InitialBackoff <= 0 {
		opts.InitialBackoff = 250 * time.Millisecond
	}
	if opts.MaxBackoff <= 0 {
		opts.MaxBackoff = 5 * time.Second
	}

	var lastErr error
	for attempt := 0; attempt < opts.MaxRetries; attempt++ {
		resp, err := CallOpenAIChatCompletion(ctx, httpClient, cfg, messages, tools)
		if err == nil && resp != nil && len(resp.Choices) > 0 {
			return resp, nil
		}

		if err != nil {
			lastErr = err
		} else if resp == nil {
			lastErr = fmt.Errorf("llm returned nil response")
		} else {
			lastErr = fmt.Errorf("llm returned empty choices")
		}

		if attempt >= opts.MaxRetries-1 {
			return nil, lastErr
		}

		backoff := WithJitter(ExpBackoff(attempt, opts.InitialBackoff, opts.MaxBackoff))
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm transient failure: channel=%s retry=%d/%d err=%v backoff=%s",
				opts.LogPrefix, opts.ChannelID, attempt+1, opts.MaxRetries, lastErr, backoff,
			)
		}
		if !SleepWithContext(ctx, backoff) {
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}
