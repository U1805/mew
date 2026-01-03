package bot

import "time"

const (
	assistantEventMessageCreate    = "MESSAGE_CREATE"
	assistantUpstreamMessageCreate = "message/create"

	assistantSilenceToken  = "<SILENCE>"
	assistantWantMoreToken = "<WANT_MORE>"

	// assistantProactiveTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <PROACTIVE>{"delay_seconds":180,"reason":"..."}
	assistantProactiveTokenPrefix = "<PROACTIVE>"

	// assistantStickerTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <STICKER>{"name":"Wave"}
	assistantStickerTokenPrefix = "<STICKER>"

	// assistantToolCallTokenPrefix is a single-line control directive emitted by the LLM.
	// Expected format (one line):
	//   <TOOL>{"name":"HistorySearch","args":{"keyword":"..."}}`
	assistantToolCallTokenPrefix = "<TOOL>"

	assistantMaxSessionMessages = 40
	assistantFetchPageSize      = 100
	assistantMaxFetchPages      = 20
	assistantMaxReplyLines      = 20
	assistantMaxToolCalls       = 3
	assistantMaxLLMRetries      = 5
	assistantMaxFacts           = 30
	assistantMaxSummaries       = 30
	assistantMaxProactiveQueue  = 16

	assistantIncomingQueueSize = 256
	assistantWorkerCount       = 4

	assistantSessionGap = 30 * time.Minute

	assistantLogPrefix = "[assistant-agent]"

	assistantLogPersonaPreviewLen    = 100
	assistantLogContentPreviewLen    = 160
	assistantLogLLMPreviewLen        = 240
	assistantLogToolResultPreviewLen = 240

	assistantSessionStartTimeFormat = "2006-01-02 15:04"
	assistantDefaultActivity        = "Active recently"

	assistantDefaultMewURL = "http://localhost:3000"

	assistantTimeSincePrefix  = "~"
	assistantTimeSinceUnknown = "unknown"

	assistantReplyDelayBase    = 350 * time.Millisecond
	assistantReplyDelayPerRune = 60 * time.Millisecond
	assistantReplyDelayMax     = 3500 * time.Millisecond

	assistantLLMRetryInitialBackoff = 250 * time.Millisecond
	assistantLLMRetryMaxBackoff     = 5 * time.Second

	PersonaPromptRelPath               = "prompt/system_prompt.txt"
	PersonaPromptEmbeddedName          = "system_prompt.txt"
	DeveloperInstructionsPromptRelPath = "prompt/instruct_prompt.txt"
	DeveloperInstructionsEmbeddedName  = "instruct_prompt.txt"

	DefaultHistorySearchToolName = "HistorySearch"
	DefaultRecordSearchToolName  = "RecordSearch"
	DefaultWebSearchToolName     = "WebSearch"

	DefaultImagePrompt              = "请识别图片中的内容，并结合上下文回复。"
	DefaultMaxImageBytes      int64 = 5 * 1024 * 1024
	DefaultMaxTotalImageBytes int64 = 12 * 1024 * 1024
)
