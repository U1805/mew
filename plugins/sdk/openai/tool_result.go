package openai

import "encoding/json"

// ToolResultMessage formats a tool result payload as a "system" ChatMessage.
func ToolResultMessage(toolName string, payload any) ChatMessage {
	b, _ := json.Marshal(payload)
	return ChatMessage{
		Role:    "system",
		Content: "TOOL_RESULT (" + toolName + "): " + string(b),
	}
}
