package config

import "time"

const (
	DefaultTimezone                = "+08:00"
	AssistantEventMessageCreate    = "MESSAGE_CREATE"
	AssistantUpstreamMessageCreate = "message/create"

	AssistantSilenceToken  = "<SILENCE>"
	AssistantWantMoreToken = "<WANT_MORE>"

	// AssistantProactiveTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <PROACTIVE>{"delay_seconds":180,"reason":"..."}
	AssistantProactiveTokenPrefix = "<PROACTIVE>"

	// AssistantStickerTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <STICKER>{"name":"Wave"}
	AssistantStickerTokenPrefix = "<STICKER>"

	// AssistantToolCallTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <TOOL>{"name":"HistorySearch","args":{"keyword":"..."}}`
	AssistantToolCallTokenPrefix = "<TOOL>"

	AssistantMaxSessionMessages = 40
	AssistantFetchPageSize      = 100
	AssistantMaxFetchPages      = 20
	AssistantMaxReplyLines      = 20
	AssistantMaxToolCalls       = 3
	AssistantMaxLLMRetries      = 5
	AssistantMaxFacts           = 30
	AssistantMaxSummaries       = 30
	AssistantMaxProactiveQueue  = 16

	// AssistantFactDefaultImportance is the conservative fallback importance score (1-10)
	// used when migrating legacy fact formats or when the model doesn't provide importance.
	AssistantFactDefaultImportance = 3

	// AssistantFactRetentionAlpha is the decay coefficient used by fact retention scoring:
	// Score = S / (1+t)^alpha.
	AssistantFactRetentionAlpha = 0.5

	// AssistantFactRetentionRecencyScale is the scaling factor C in:
	// t = ((L-1-Index)/L) * C.
	AssistantFactRetentionRecencyScale = 10.0

	// AssistantFactMinForConsolidation skips consolidation when facts are too few.
	AssistantFactMinForConsolidation = 8

	// AssistantFactMaxConsolidationOps caps consolidation operations per run.
	AssistantFactMaxConsolidationOps = 8

	AssistantIncomingQueueSize = 256
	AssistantWorkerCount       = 4

	AssistantSessionGap = 30 * time.Minute

	AssistantLogPrefix = "[assistant-agent]"

	AssistantLogPersonaPreviewLen    = 100
	AssistantLogContentPreviewLen    = 160
	AssistantLogLLMPreviewLen        = 240
	AssistantLogToolResultPreviewLen = 240

	AssistantSessionStartTimeFormat = "2006-01-02 15:04"
	AssistantDefaultActivity        = "Active recently"

	AssistantDefaultMewURL = "http://localhost:3000"

	AssistantTimeSincePrefix  = "~"
	AssistantTimeSinceUnknown = "unknown"

	AssistantReplyDelayBase    = 350 * time.Millisecond
	AssistantReplyDelayPerRune = 60 * time.Millisecond
	AssistantReplyDelayMax     = 3500 * time.Millisecond

	// AssistantTypingWPMDefault is the default typing speed simulation.
	// WPM counts "words" as Unicode characters (runes) for this project.
	AssistantTypingWPMDefault = 30

	AssistantLLMRetryInitialBackoff = 250 * time.Millisecond
	AssistantLLMRetryMaxBackoff     = 5 * time.Second

	PersonaPromptRelPath               = "agent/prompt/system_prompt.txt"
	PersonaPromptEmbeddedName          = "system_prompt.txt"
	DeveloperInstructionsPromptRelPath = "agent/prompt/instruct_prompt.txt"
	DeveloperInstructionsEmbeddedName  = "instruct_prompt.txt"

	DefaultHistorySearchToolName = "HistorySearch"
	DefaultRecordSearchToolName  = "RecordSearch"
	DefaultWebSearchToolName     = "WebSearch"

	DefaultImagePrompt              = "请识别图片中的内容，并结合上下文回复。"
	DefaultMaxImageBytes      int64 = 5 * 1024 * 1024
	DefaultMaxTotalImageBytes int64 = 12 * 1024 * 1024

	StickerCacheTTL   = 60 * time.Second
	ExaSearchEndpoint = "https://api.exa.ai/search"

	DefaultBaselineValence = 0.2
	DefaultBaselineArousal = 0.1
	MoodDecayKPerHour      = 0.25
)
