package memory

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/infra"
	"mew/plugins/pkg/x/llm"
)

// =============================================================================
// Consolidation
// =============================================================================

// FactConsolidationOp 表示一次“记忆整理”输出的操作（由 LLM 生成）。
//
// 它描述：
//   - 参与整理的源事实（source_memories，ID 必须存在于当前 Facts 列表）
//   - 整理类型（去重/归纳/推理/冲突）
//   - 简短的 reasoning（便于日志观测）
//   - new_memory：整理后的新洞察（更结构化、更有用）
//   - importance：新洞察的重要性评分
//
// 应用该操作时会：
//   - 删除所有源事实（释放空间，并避免重复/冲突继续占用）
//   - 将 new_memory 作为新事实追加到尾部（表示最新洞察）
type FactConsolidationOp struct {
	SourceMemories []FactConsolidationSource `json:"source_memories"`
	Type           string                    `json:"type"`
	Reasoning      string                    `json:"reasoning"`
	NewMemory      string                    `json:"new_memory"`
	Importance     int                       `json:"importance"`
}

// FactConsolidationSource 表示记忆整理时引用的源事实。
//
// content 仅用于让模型复述/理解上下文；应用时必须以 id 为准，而不是以 content 反查。
type FactConsolidationSource struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

// MaybeConsolidateFacts 按“每天一次”的节奏尝试执行事实记忆整理。
//
// 记忆整理目标：
//   - 去重：合并语义重复的事实（累加频次释放空间）
//   - 归纳：从多条琐事提炼出更稳定、更抽象的偏好/习惯
//   - 推理：把相关事实串联成更有用的综合上下文
//   - 冲突：处理矛盾时保留“变化历史”，而不是简单删除旧事实
//
// 该流程刻意保守：
//   - 事实数量过少时不整理（避免浪费 LLM 预算）
//   - 每次最多应用有限条操作（便于审计与回滚）
//
// 返回值：
//   - 更新后的 FactsFile
//   - ran：本次是否“到期并尝试执行”（即使因事实过少而跳过，也算 ran=true）
//   - err：LLM 调用或解析失败时返回错误
func MaybeConsolidateFacts(
	c infra.LLMCallContext,
	now time.Time,
	facts FactsFile,
	maxFacts int,
	opts infra.CognitiveRetryOptions,
) (FactsFile, bool, error) {
	if !shouldConsolidateFacts(now, facts.LastConsolidatedAt) {
		return facts, false, nil
	}
	if len(facts.Facts) < infra.AssistantFactMinForConsolidation {
		facts.LastConsolidatedAt = now
		return facts, true, nil
	}

	updated, err := consolidateFacts(c, now, facts, maxFacts, opts)
	if err != nil {
		return facts, true, err
	}
	return updated, true, nil
}

// shouldConsolidateFacts 基于“自然日边界”判断是否需要执行记忆整理。
func shouldConsolidateFacts(now time.Time, last time.Time) bool {
	if now.IsZero() {
		now = time.Now()
	}
	if last.IsZero() {
		return true
	}
	y1, m1, d1 := now.Date()
	y2, m2, d2 := last.Date()
	return y1 != y2 || m1 != m2 || d1 != d2
}

// consolidateFacts 执行一次记忆整理，并在成功后写入 LastConsolidatedAt。
func consolidateFacts(
	c infra.LLMCallContext,
	now time.Time,
	facts FactsFile,
	maxFacts int,
	opts infra.CognitiveRetryOptions,
) (FactsFile, error) {
	ctx := infra.ContextOrBackground(c.Ctx)

	openaiCfg, err := c.Config.OpenAIChatConfig()
	if err != nil {
		return FactsFile{}, err
	}

	system := `You are a high-fidelity memory consolidation engine for a personal assistant.
Your goal is to organize facts while STRICTLY PRESERVING SPECIFIC DETAILS.
Avoid over-abstraction. Information density is more important than brevity.
Avoid over-abstraction. Information density is more important than brevity.

Your task: look at existing user facts and produce a SMALL list of consolidation operations.
Only output operations when you are highly confident.

Operation types & Strict Rules:
- Deduplication: Merge facts ONLY if they are semantically identical. 
  * CRITICAL: Do not merge if one fact contains specific details (e.g., "likes Sony headphones") and the other is generic ("likes headphones"). Keep the specific one.
- Generalization: Identify patterns but RETAIN EXAMPLES. 
  * Bad: "User likes fruit" (derived from apples/bananas).
  * Good: "User likes fruits, specifically apples and bananas."
- Inference: Connect related facts only if 100% logically implied. Do not guess.
- Conflict: Resolve contradictions. Use "formerly... now..." format for status changes.

Golden Rules for "new_memory":
1. ENTITY PRESERVATION: Never delete Proper Nouns, Numbers, Dates, Brand Names, or Locations.
2. SPECIFICITY OVER BREVITY: "Gym at 6pm on Mondays" is better than "Exercises weekly."
3. CONTEXT RETENTION: If a preference has a specific context (e.g., "only drinks wine with dinner"), keep the condition.

For each NEW fact, provide an importance score 1-10:
- 1-2: trivial, no long-term value (small talk, fleeting bodily actions).
- 3-4: short-term useful, decays quickly (temporary plans, one-off tasks).
- 5-6: long-term preferences/habits (likes/dislikes, routines).
- 7-8: key life framework facts (job, city, key relationships, major goals).
- 9-10: core identity / hard constraints / explicit "remember this" instruction.

Rules:
- The "new_memory" must be written in the user's language.
- Importance is 1-10 with a conservative rubric; if unsure between 6 and 7 choose 6.
- If a memory is explicitly a "remember this" / hard constraint, importance must be 10.
- Prefer fewer ops; max ` + fmt.Sprintf("%d", infra.AssistantFactMaxConsolidationOps) + `.
Return ONLY a JSON array like:
[{"source_memories":[{"id":"F1a2b","content":"..."}],"type":"Deduplication","reasoning":"...","new_memory":"...","importance":7}]`

	user := "Facts (ordered by recency; tail is newest):\n" + formatFactsForConsolidation(facts) +
		"\n\nReturn ONLY the JSON array."

	var ops []FactConsolidationOp
	err = infra.RetryCognitive(ctx, opts, func() error {
		resp, err := llm.CallOpenAIChatCompletion(ctx, c.HTTPClient, openaiCfg, []openaigo.ChatCompletionMessageParamUnion{
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
		logPrefix := opts.LogPrefix
		if strings.TrimSpace(logPrefix) == "" {
			logPrefix = infra.AssistantLogPrefix
		}
		log.Printf("%s facts consolidation model_json=%s", logPrefix, raw)

		var parsed []FactConsolidationOp
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			return fmt.Errorf("consolidation invalid json: %w", err)
		}
		if len(parsed) > infra.AssistantFactMaxConsolidationOps {
			parsed = parsed[:infra.AssistantFactMaxConsolidationOps]
		}
		ops = parsed
		return nil
	})
	if err != nil {
		return FactsFile{}, err
	}

	updated := applyConsolidationOps(now, facts, ops, maxFacts)
	updated.LastConsolidatedAt = now
	return updated, nil
}

// applyConsolidationOps 将模型输出的整理操作应用到 FactsFile（保守策略）。
//
// 核心步骤：
//   - 校验 source IDs 必须存在
//   - 删除所有源事实
//   - 将 new_memory 作为新事实写入尾部，并累加源事实 Frequency
//   - 最后强制执行容量裁剪（ApplyFactRetentionCap）
func applyConsolidationOps(now time.Time, facts FactsFile, ops []FactConsolidationOp, maxFacts int) FactsFile {
	if len(ops) == 0 {
		return facts
	}

	byID := make(map[string]Fact, len(facts.Facts))
	for _, f := range facts.Facts {
		id := strings.ToUpper(strings.TrimSpace(f.FactID))
		if id == "" {
			continue
		}
		byID[id] = f
	}

	for _, op := range ops {
		opType := normalizeConsolidationType(op.Type)
		if opType == "" {
			continue
		}
		newContent := strings.TrimSpace(op.NewMemory)
		if newContent == "" {
			continue
		}

		sourceIDs := make([]string, 0, len(op.SourceMemories))
		sumFreq := 0
		for _, src := range op.SourceMemories {
			id := strings.ToUpper(strings.TrimSpace(src.ID))
			if id == "" {
				continue
			}
			if f, ok := byID[id]; ok {
				sourceIDs = append(sourceIDs, id)
				sumFreq += clampFrequency(f.Frequency)
			}
		}
		if len(sourceIDs) < 2 {
			continue
		}
		if sumFreq <= 0 {
			sumFreq = 1
		}

		toDelete := make(map[string]struct{}, len(sourceIDs))
		for _, id := range sourceIDs {
			toDelete[id] = struct{}{}
		}

		if len(toDelete) > 0 {
			kept := make([]Fact, 0, len(facts.Facts))
			for _, f := range facts.Facts {
				id := strings.ToUpper(strings.TrimSpace(f.FactID))
				if _, ok := toDelete[id]; ok {
					delete(byID, id)
					continue
				}
				kept = append(kept, f)
			}
			facts.Facts = kept
		}

		facts.Facts = upsertConsolidatedFact(now, facts.Facts, Fact{
			FactID:         "",
			Content:        newContent,
			Importance:     clampImportance(op.Importance),
			Frequency:      sumFreq,
			CreatedAt:      now,
			LastAccessedAt: now,
		})

		byID = make(map[string]Fact, len(facts.Facts))
		for _, f := range facts.Facts {
			id := strings.ToUpper(strings.TrimSpace(f.FactID))
			if id == "" {
				continue
			}
			byID[id] = f
		}
	}

	facts.Facts = ApplyFactRetentionCap(facts.Facts, maxFacts)
	return facts
}

// normalizeConsolidationType 将模型输出的 type 归一到有限的标准集合。
func normalizeConsolidationType(s string) string {
	t := strings.TrimSpace(s)
	if t == "" {
		return ""
	}
	switch strings.ToLower(t) {
	case "deduplication", "dedupe", "dedup", "de-dup", "de-duplication", "去重":
		return "Deduplication"
	case "generalization", "generalise", "generalize", "归纳":
		return "Generalization"
	case "inference", "infer", "推理", "因果推理":
		return "Inference"
	case "conflict", "conflicts", "冲突", "冲突处理":
		return "Conflict"
	default:
		return ""
	}
}

// upsertConsolidatedFact 写入“整理后的新事实”，并保持 Recency 语义（尾部最新）。
func upsertConsolidatedFact(now time.Time, facts []Fact, consolidated Fact) []Fact {
	key := strings.ToLower(strings.TrimSpace(consolidated.Content))
	if key == "" {
		return facts
	}

	for i := range facts {
		if strings.ToLower(strings.TrimSpace(facts[i].Content)) != key {
			continue
		}
		facts[i].LastAccessedAt = now
		facts[i].Frequency = clampFrequency(facts[i].Frequency) + clampFrequency(consolidated.Frequency)
		if clampImportance(consolidated.Importance) > clampImportance(facts[i].Importance) {
			facts[i].Importance = clampImportance(consolidated.Importance)
		}

		f := facts[i]
		copy(facts[i:], facts[i+1:])
		facts[len(facts)-1] = f
		return facts
	}

	consolidated.FactID = infra.NextIDRandomHex4(infra.CollectIDs(facts, func(f Fact) string { return f.FactID }), 'F')
	consolidated.Importance = clampImportance(consolidated.Importance)
	consolidated.Frequency = clampFrequency(consolidated.Frequency)
	consolidated.CreatedAt = now
	consolidated.LastAccessedAt = now
	return append(facts, consolidated)
}

func formatFactsForConsolidation(f FactsFile) string {
	if len(f.Facts) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for idx, fact := range f.Facts {
		id := strings.TrimSpace(fact.FactID)
		content := strings.TrimSpace(fact.Content)
		if id == "" || content == "" {
			continue
		}
		fmt.Fprintf(&b, "%d) %s: %s (importance=%d, frequency=%d)\n", idx, id, content, clampImportance(fact.Importance), clampFrequency(fact.Frequency))
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "(none)"
	}
	return out
}
