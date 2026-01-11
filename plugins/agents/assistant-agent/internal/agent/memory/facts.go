package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk/x/llm"
)

type Fact struct {
	FactID         string    `json:"factId"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"createdAt"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

type FactsFile struct {
	Facts []Fact `json:"facts"`
}

func NextFactID(facts []Fact) string {
	maxN := 0
	for _, fact := range facts {
		id := strings.TrimSpace(fact.FactID)
		if len(id) != 3 || (id[0] != 'F' && id[0] != 'f') {
			continue
		}
		n := int(id[1]-'0')*10 + int(id[2]-'0')
		if n > maxN {
			maxN = n
		}
	}
	n := maxN + 1
	if n > 99 {
		n = 99
	}
	return "F" + twoDigits(n)
}

func ApplyFactLRUCap(facts []Fact, cap int) []Fact {
	if cap <= 0 || len(facts) <= cap {
		return facts
	}
	sort.SliceStable(facts, func(i, j int) bool {
		ai := facts[i].LastAccessedAt
		aj := facts[j].LastAccessedAt
		if ai.IsZero() && aj.IsZero() {
			return facts[i].CreatedAt.Before(facts[j].CreatedAt)
		}
		if ai.IsZero() {
			return true
		}
		if aj.IsZero() {
			return false
		}
		return ai.Before(aj)
	})
	return append([]Fact(nil), facts[len(facts)-cap:]...)
}

func TouchFactsUsedByContent(facts []Fact, content string, now time.Time) []Fact {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return facts
	}
	for i := range facts {
		needle := strings.TrimSpace(facts[i].Content)
		if needle == "" {
			continue
		}
		if strings.Contains(trimmed, needle) {
			facts[i].LastAccessedAt = now
		}
	}
	return facts
}

func TouchFactsByIDs(facts []Fact, ids []string, now time.Time) []Fact {
	if len(facts) == 0 || len(ids) == 0 {
		return facts
	}
	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		t := strings.TrimSpace(id)
		if t == "" {
			continue
		}
		want[strings.ToUpper(t)] = struct{}{}
	}
	if len(want) == 0 {
		return facts
	}
	for i := range facts {
		id := strings.ToUpper(strings.TrimSpace(facts[i].FactID))
		if id == "" {
			continue
		}
		if _, ok := want[id]; ok {
			facts[i].LastAccessedAt = now
		}
	}
	return facts
}

func twoDigits(n int) string {
	if n < 0 {
		n = 0
	}
	if n > 99 {
		n = 99
	}
	return string([]byte{'0' + byte(n/10), '0' + byte(n%10)})
}

func UpsertFacts(now time.Time, facts FactsFile, newFacts []string, maxFacts int) FactsFile {
	if facts.Facts == nil {
		facts.Facts = []Fact{}
	}

	existing := make(map[string]struct{}, len(facts.Facts))
	for _, f := range facts.Facts {
		key := strings.ToLower(strings.TrimSpace(f.Content))
		if key != "" {
			existing[key] = struct{}{}
		}
	}

	for _, nf := range newFacts {
		key := strings.ToLower(strings.TrimSpace(nf))
		if key == "" {
			continue
		}
		if _, ok := existing[key]; ok {
			continue
		}
		existing[key] = struct{}{}
		facts.Facts = append(facts.Facts, Fact{
			FactID:         NextFactID(facts.Facts),
			Content:        strings.TrimSpace(nf),
			CreatedAt:      now,
			LastAccessedAt: now,
		})
	}

	facts.Facts = ApplyFactLRUCap(facts.Facts, maxFacts)
	return facts
}

type FactEngineResult struct {
	Facts       []string `json:"facts"`
	UsedFactIDs []string `json:"used_fact_ids"`
}

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

func retryCognitive(ctx context.Context, opts CognitiveRetryOptions, fn func() error) error {
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

func ExtractFactsAndUsage(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, sessionText string, existing FactsFile) (FactEngineResult, error) {
	return ExtractFactsAndUsageWithRetry(ctx, httpClient, cfg, sessionText, existing, CognitiveRetryOptions{})
}

func ExtractFactsAndUsageWithRetry(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, sessionText string, existing FactsFile, opts CognitiveRetryOptions) (FactEngineResult, error) {
	system := `You are a fact extraction engine.
Extract stable, user-specific facts from the conversation.
Write each fact in the user's language (use the predominant language of the conversation).
Do not translate facts into English unless the user is speaking English.
Also identify which existing facts were mentioned or strongly implied (semantic match is allowed).`
	user := "Conversation:\n" + sessionText + "\n\nExisting facts (ID: content):\n" + formatFactsForCognitive(existing) + "\n\nReturn ONLY a JSON object like:\n{\"facts\": [\"...\"], \"used_fact_ids\": [\"F01\", \"F02\"]}\n"

	openaiCfg, err := cfg.OpenAIChatConfig()
	if err != nil {
		return FactEngineResult{}, err
	}

	var out FactEngineResult
	err = retryCognitive(ctx, opts, func() error {
		resp, err := llm.CallOpenAIChatCompletion(ctx, httpClient, openaiCfg, []openaigo.ChatCompletionMessageParamUnion{
			openaigo.SystemMessage(system),
			openaigo.UserMessage(user),
		}, nil)
		if err != nil {
			return err
		}
		if resp == nil || len(resp.Choices) == 0 {
			return fmt.Errorf("llm returned empty choices")
		}

		raw := extractJSONFromText(resp.Choices[0].Message.Content)
		var parsed FactEngineResult
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			// Backward compat: allow a plain array output.
			var arr []string
			if err2 := json.Unmarshal([]byte(raw), &arr); err2 != nil {
				return fmt.Errorf("fact engine invalid json: %w (raw=%s)", err, raw)
			}
			parsed.Facts = arr
		}

		cleanFacts := make([]string, 0, len(parsed.Facts))
		for _, s := range parsed.Facts {
			t := strings.TrimSpace(s)
			if t == "" {
				continue
			}
			cleanFacts = append(cleanFacts, t)
		}

		cleanIDs := make([]string, 0, len(parsed.UsedFactIDs))
		for _, id := range parsed.UsedFactIDs {
			t := strings.TrimSpace(id)
			if t == "" {
				continue
			}
			cleanIDs = append(cleanIDs, t)
		}

		out = FactEngineResult{Facts: cleanFacts, UsedFactIDs: cleanIDs}
		return nil
	})
	if err != nil {
		return FactEngineResult{}, err
	}
	return out, nil
}

func extractJSONFromText(s string) string {
	raw := strings.TrimSpace(s)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "```") {
		rest := strings.TrimSpace(strings.TrimPrefix(raw, "```"))
		if i := strings.Index(rest, "\n"); i >= 0 {
			rest = rest[i+1:]
		}
		if j := strings.LastIndex(rest, "```"); j >= 0 {
			rest = rest[:j]
		}
		raw = strings.TrimSpace(rest)
	}
	if !(strings.HasPrefix(raw, "{") || strings.HasPrefix(raw, "[")) {
		if i := strings.Index(raw, "{"); i >= 0 {
			if j := strings.LastIndex(raw, "}"); j > i {
				return strings.TrimSpace(raw[i : j+1])
			}
		}
		if i := strings.Index(raw, "["); i >= 0 {
			if j := strings.LastIndex(raw, "]"); j > i {
				return strings.TrimSpace(raw[i : j+1])
			}
		}
	}
	return strings.TrimSpace(raw)
}

func formatFactsForCognitive(f FactsFile) string {
	if len(f.Facts) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for _, fact := range f.Facts {
		id := strings.TrimSpace(fact.FactID)
		content := strings.TrimSpace(fact.Content)
		if id == "" || content == "" {
			continue
		}
		b.WriteString(id)
		b.WriteString(": ")
		b.WriteString(content)
		b.WriteString("\n")
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "(none)"
	}
	return out
}
