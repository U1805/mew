package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/assistant-agent/internal/agent/utils"
	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/sdk/x/llm"
)

// =============================================================================
// Data Types
// =============================================================================

// Fact 表示一条用户“事实记忆（L3）”。
type Fact struct {
	FactID string `json:"factId"`

	// Content 是要长期存储的用户事实内容。
	Content string `json:"content"`

	// Importance 为重要性分数，范围 1-10。
	Importance int `json:"importance"`

	// Frequency 为频次计数：当事实被“命中”（被提到/被使用/被强烈暗示）时递增。
	Frequency int `json:"frequency"`

	// CreatedAt 为事实首次创建时间。
	CreatedAt time.Time `json:"createdAt"`

	// LastAccessedAt 为事实最近一次“命中”或插入的时间。
	// 注意：它不是 Recency 的主信号（Recency 来自 slice 顺序），但保留用于调试与兼容旧数据。
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

// FactsFile 是 L3 事实记忆的落盘结构（facts.json）。
type FactsFile struct {
	Facts []Fact `json:"facts"`

	// LastConsolidatedAt 表示该用户上一次事实记忆整理成功运行的时间。
	// 将其放在同一文件中是为了避免与其它状态文件（如 metadata）产生强耦合。
	LastConsolidatedAt time.Time `json:"lastConsolidatedAt"`
}

// FactCandidate 表示“新抽取的事实候选”，包含 LLM 给出的重要性分数。
type FactCandidate struct {
	Content    string `json:"content"`
	Importance int    `json:"importance"`
}

// FactEngineResult 是 LLM “事实抽取引擎” 的结构化输出。
type FactEngineResult struct {
	Facts       []FactCandidate `json:"facts"`
	UsedFactIDs []string        `json:"used_fact_ids"`
}

// =============================================================================
// Retention / Forgetting
// =============================================================================

func clampImportance(v int) int {
	if v <= 0 {
		return config.AssistantFactDefaultImportance
	}
	if v < 1 {
		return 1
	}
	if v > 10 {
		return 10
	}
	return v
}

// clampFrequency 确保频次至少为 1，以保证 ln(F) 定义良好且数值稳定。
func clampFrequency(v int) int {
	if v <= 0 {
		return 1
	}
	return v
}

// touchFact 表示一次“命中”对单条事实的更新：更新时间、频次递增、重要性归一。
func touchFact(f Fact, now time.Time) Fact {
	f.LastAccessedAt = now
	f.Frequency = clampFrequency(f.Frequency) + 1
	f.Importance = clampImportance(f.Importance)
	return f
}

// factRetentionScore 计算 facts[i] 的保留分数（用于淘汰排序）。
//
// 约定：
//   - Recency 由 slice index 表示（尾部最新）
//   - L 使用当前 slice 长度（与设计文档一致）
func factRetentionScore(facts []Fact, i int) float64 {
	if len(facts) == 0 || i < 0 || i >= len(facts) {
		return 0
	}
	L := float64(len(facts))
	if L <= 0 {
		L = 1
	}

	f := facts[i]
	I := float64(clampImportance(f.Importance))
	F := float64(clampFrequency(f.Frequency))
	S := I * (1.0 + math.Log(F))

	index := float64(i)
	t := ((L - 1.0 - index) / L) * config.AssistantFactRetentionRecencyScale
	if t < 0 {
		t = 0
	}

	return S / math.Pow(1.0+t, config.AssistantFactRetentionAlpha)
}

// ApplyFactRetentionCap 将事实列表裁剪到指定容量 cap，并通过“保留分数”淘汰最低者。
//
// 当 len(facts) > cap 时，会反复删除保留分数最小的元素：
//
//	Score = S / (1 + t)^alpha
//	S     = I * (1 + ln(F))
//	t     = ((L-1-Index)/L) * C
func ApplyFactRetentionCap(facts []Fact, cap int) []Fact {
	if cap <= 0 || len(facts) <= cap {
		return facts
	}
	out := append([]Fact(nil), facts...)
	for len(out) > cap {
		minIdx := 0
		minScore := factRetentionScore(out, 0)
		for i := 1; i < len(out); i++ {
			s := factRetentionScore(out, i)
			if s < minScore {
				minScore = s
				minIdx = i
			}
		}
		out = append(out[:minIdx], out[minIdx+1:]...)
	}
	return out
}

// =============================================================================
// Core Operations
// =============================================================================

// TouchFactsByIDs 根据 FactID 精确标记哪些事实被使用（命中）。
//
// 命中后会做三件事：
//  1. Frequency++（加固记忆）
//  2. 更新 LastAccessedAt（便于调试/观测）
//  3. 将该 fact 移动到 slice 尾部（用 index 表示 Recency）
//
// 说明：当前系统实际命中由 LLM fact engine 输出的used_fact_ids 驱动，以获得更好的语义匹配准确度。
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

	matched := make([]Fact, 0, len(want))
	kept := make([]Fact, 0, len(facts))
	for i := range facts {
		id := strings.ToUpper(strings.TrimSpace(facts[i].FactID))
		if id == "" {
			kept = append(kept, facts[i])
			continue
		}
		if _, ok := want[id]; ok {
			facts[i] = touchFact(facts[i], now)
			matched = append(matched, facts[i])
			continue
		}
		kept = append(kept, facts[i])
	}
	if len(matched) == 0 {
		return facts
	}
	return append(kept, matched...)
}

// UpsertFacts 将“新抽取的事实候选”合入现有事实记忆中。
//
// 具体规则：
//   - 新内容（忽略大小写）会 append 到尾部，并初始化 Importance / Frequency。
//   - 重复内容视为“命中”：Frequency++ 且移动到尾部（加固并变新）。
//   - 合入后会调用 ApplyFactRetentionCap 依据保留分数裁剪到 maxFacts。
//
// 说明：该函数不做 I/O，仅纯粹修改并返回内存结构，便于调用方统一落盘。
func UpsertFacts(now time.Time, facts FactsFile, newFacts []FactCandidate, maxFacts int) FactsFile {
	if facts.Facts == nil {
		facts.Facts = []Fact{}
	}

	type idxAndFact struct {
		idx  int
		fact Fact
	}
	existing := make(map[string]idxAndFact, len(facts.Facts))
	for i, f := range facts.Facts {
		key := strings.ToLower(strings.TrimSpace(f.Content))
		if key == "" {
			continue
		}
		existing[key] = idxAndFact{idx: i, fact: f}
	}

	for _, nf := range newFacts {
		key := strings.ToLower(strings.TrimSpace(nf.Content))
		if key == "" {
			continue
		}
		imp := clampImportance(nf.Importance)

		if hit, ok := existing[key]; ok {
			// Treat duplicates as “hit”: bump frequency and move to tail.
			facts.Facts = TouchFactsByIDs(facts.Facts, []string{hit.fact.FactID}, now)
			continue
		}

		facts.Facts = append(facts.Facts, Fact{
			FactID:         utils.NextIDRandomHex4(utils.CollectIDs(facts.Facts, func(f Fact) string { return f.FactID }), 'F'),
			Content:        strings.TrimSpace(nf.Content),
			Importance:     imp,
			Frequency:      1,
			CreatedAt:      now,
			LastAccessedAt: now,
		})
		existing[key] = idxAndFact{idx: len(facts.Facts) - 1, fact: facts.Facts[len(facts.Facts)-1]}
	}

	facts.Facts = ApplyFactRetentionCap(facts.Facts, maxFacts)
	return facts
}

// =============================================================================
// LLM: Fact Extraction
// =============================================================================

// ExtractFactsAndUsage 调用 LLM 事实抽取引擎（使用默认重试参数）。
//
// 它会从 sessionText 中抽取新的稳定事实，并识别本轮对话使用/提及了哪些已有事实 ID。
// 模型需要完成：
//   - 从对话中抽取“稳定、用户相关、长期有价值”的事实
//   - 为每条新事实给出重要性分数（1-10，且遵循保守原则）
//   - 输出本轮对话命中了哪些已有事实 ID（允许语义匹配）
//
// 兼容旧输出：
//   - 纯 JSON string 数组：["..."]
//   - 或对象：{"facts":["..."],"used_fact_ids":[...]}
func ExtractFactsAndUsage(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, sessionText string, existing FactsFile) (FactEngineResult, error) {
	return ExtractFactsAndUsageWithRetry(ctx, httpClient, cfg, sessionText, existing, utils.CognitiveRetryOptions{})
}

func ExtractFactsAndUsageWithRetry(ctx context.Context, httpClient *http.Client, cfg config.AssistantConfig, sessionText string, existing FactsFile, opts utils.CognitiveRetryOptions) (FactEngineResult, error) {
	system := `You are a fact extraction engine.
Extract stable, user-specific facts from the conversation.
Write each fact in the user's language (use the predominant language of the conversation).
Do not translate facts into English unless the user is speaking English.
Also identify which existing facts were mentioned or strongly implied (semantic match is allowed).

For each NEW fact, provide an importance score 1-10:
- 1-2: trivial, no long-term value (small talk, fleeting bodily actions).
- 3-4: short-term useful, decays quickly (temporary plans, one-off tasks).
- 5-6: long-term preferences/habits (likes/dislikes, routines).
- 7-8: key life framework facts (job, city, key relationships, major goals).
- 9-10: core identity / hard constraints / explicit "remember this" instruction.
Conservative principle: if unsure between 6 and 7, choose 6.
If the user explicitly says "记住/remember", set importance=10 for that instruction-derived fact.`
	user := "Conversation:\n" + sessionText + "\n\nExisting facts (ID: content):\n" + formatFactsForCognitive(existing) + "\n\nReturn ONLY a JSON object like:\n{\"facts\": [{\"content\":\"...\",\"importance\":7}], \"used_fact_ids\": [\"F1a2b\", \"F0f3c\"]}\n"

	openaiCfg, err := cfg.OpenAIChatConfig()
	if err != nil {
		return FactEngineResult{}, err
	}

	var out FactEngineResult
	err = utils.RetryCognitive(ctx, opts, func() error {
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

		parsed, err := parseFactEngineResult(raw)
		if err != nil {
			return fmt.Errorf("fact engine invalid json: %w (raw=%s)", err, raw)
		}

		cleanFacts := make([]FactCandidate, 0, len(parsed.Facts))
		for _, f := range parsed.Facts {
			content := strings.TrimSpace(f.Content)
			if content == "" {
				continue
			}
			imp := clampImportance(f.Importance)
			cleanFacts = append(cleanFacts, FactCandidate{Content: content, Importance: imp})
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

// extractJSONFromText 用于从 LLM 输出中尽可能提取 JSON（对象或数组）。
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

// parseFactEngineResult 解析 LLM 输出（兼容历史格式）。
//
// 支持的 JSON 形态：
//  1. {"facts":[{"content":"...","importance":7}], "used_fact_ids":["F1a2b"]}  // 新格式
//  2. {"facts":["..."], "used_fact_ids":["F1a2b"]}                             // 旧格式
//  3. ["..."]                                                                // 旧格式
func parseFactEngineResult(raw string) (FactEngineResult, error) {
	// New shape.
	var parsed FactEngineResult
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
		return parsed, nil
	}

	// Legacy shape: {"facts":["..."], "used_fact_ids":[...]}.
	type legacyObj struct {
		Facts       []string `json:"facts"`
		UsedFactIDs []string `json:"used_fact_ids"`
	}
	var legacy legacyObj
	if err := json.Unmarshal([]byte(raw), &legacy); err == nil && (len(legacy.Facts) > 0 || len(legacy.UsedFactIDs) > 0) {
		out := FactEngineResult{UsedFactIDs: legacy.UsedFactIDs}
		out.Facts = make([]FactCandidate, 0, len(legacy.Facts))
		for _, s := range legacy.Facts {
			if t := strings.TrimSpace(s); t != "" {
				out.Facts = append(out.Facts, FactCandidate{Content: t, Importance: config.AssistantFactDefaultImportance})
			}
		}
		return out, nil
	}

	// Legacy shape: plain array of strings.
	var arr []string
	if err := json.Unmarshal([]byte(raw), &arr); err == nil {
		out := FactEngineResult{Facts: make([]FactCandidate, 0, len(arr))}
		for _, s := range arr {
			if t := strings.TrimSpace(s); t != "" {
				out.Facts = append(out.Facts, FactCandidate{Content: t, Importance: config.AssistantFactDefaultImportance})
			}
		}
		return out, nil
	}

	return FactEngineResult{}, fmt.Errorf("unsupported json shape")
}
