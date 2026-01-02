package ai

import "time"

const (
	DefaultBaseURL         = "https://api.openai.com/v1"
	DefaultModel           = "gpt-4o-mini"
	MaxRetries             = 5
	DefaultChatHTTPTimeout = 75 * time.Second
)

const (
	defaultTextPrompt               = "请帮我处理这段内容。"
	defaultImagePrompt              = "请识别图片中的内容，并结合上下文回复。"
	defaultMaxImageBytes      int64 = 5 * 1024 * 1024
	defaultMaxTotalImageBytes int64 = 12 * 1024 * 1024
)
