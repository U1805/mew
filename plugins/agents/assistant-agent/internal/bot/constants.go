package bot

import "time"

const (
	assistantEventMessageCreate    = "MESSAGE_CREATE"
	assistantUpstreamMessageCreate = "message/create"

	assistantSilenceToken = "<SILENCE>"

	assistantMaxSessionMessages = 40
	assistantFetchPageSize      = 100
	assistantMaxFetchPages      = 20
	assistantMaxReplyLines      = 20
	assistantMaxToolCalls       = 3
	assistantMaxFacts           = 30
	assistantMaxSummaries       = 30

	assistantSessionGap = 10 * time.Minute

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

	PersonaPromptRelPath               = "prompt/system_prompt.txt"
	PersonaPromptEmbeddedName          = "system_prompt.txt"
	DeveloperInstructionsPromptRelPath = "prompt/instruct_prompt.txt"
	DeveloperInstructionsEmbeddedName  = "instruct_prompt.txt"

	DefaultHistorySearchToolName = "HistorySearch"
	DefaultRecordSearchToolName  = "RecordSearch"

	DefaultImagePrompt              = "请识别图片中的内容，并结合上下文回复。"
	DefaultMaxImageBytes      int64 = 5 * 1024 * 1024
	DefaultMaxTotalImageBytes int64 = 12 * 1024 * 1024
)
