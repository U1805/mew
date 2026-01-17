package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/internal/agents/assistant-agent/agentctx"
	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/pkg"
	"mew/plugins/pkg/x/llm"
)

type ToolHandlers struct {
	HistorySearch func(ctx context.Context, keyword string) (any, error)
	RecordSearch  func(ctx context.Context, recordID string) (any, error)
	WebSearch     func(ctx context.Context, query string) (any, error)
}

type ChatWithToolsOptions struct {
	MaxToolCalls          int
	HistorySearchToolName string
	RecordSearchToolName  string
	WebSearchToolName     string
	LogPrefix             string
	ChannelID             string
	LLMPreviewLen         int
	ToolResultPreviewLen  int
	// OnToolCallAssistantText is called when the model emits tool directives along with user-visible text.
	// This can be used to surface the "thinking / searching" message to the frontend before tools run.
	OnToolCallAssistantText func(text string) error
	// Control directives (used to strip from tool-call prelude text).
	SilenceToken         string
	WantMoreToken        string
	ProactiveTokenPrefix string
	StickerTokenPrefix   string

	// LLM call retries (for flaky upstreams returning errors or empty choices).
	MaxLLMRetries          int
	LLMRetryInitialBackoff time.Duration
	LLMRetryMaxBackoff     time.Duration
}

func ChatWithTools(
	c agentctx.LLMCallContext,
	personaSystem string,
	firstUserPrompt string,
	l5 []openaigo.ChatCompletionMessageParamUnion,
	handlers ToolHandlers,
	opts ChatWithToolsOptions,
) (reply string, finalMood memory.Mood, gotMood bool, err error) {
	ctx := agentctx.ContextOrBackground(c.Ctx)

	if opts.MaxToolCalls <= 0 {
		opts.MaxToolCalls = 3
	}
	if strings.TrimSpace(opts.HistorySearchToolName) == "" {
		opts.HistorySearchToolName = "HistorySearch"
	}
	if strings.TrimSpace(opts.RecordSearchToolName) == "" {
		opts.RecordSearchToolName = "RecordSearch"
	}
	if strings.TrimSpace(opts.WebSearchToolName) == "" {
		opts.WebSearchToolName = "WebSearch"
	}

	messages := make([]openaigo.ChatCompletionMessageParamUnion, 0, 2+len(l5)+opts.MaxToolCalls*4)
	messages = append(messages,
		openaigo.SystemMessage(strings.TrimSpace(personaSystem)),
		openaigo.UserMessage(strings.TrimSpace(firstUserPrompt)),
	)
	messages = append(messages, l5...)

	type pendingRecordSearchResult struct {
		index    int
		recordID string
	}
	var pendingRecordSearch []pendingRecordSearchResult
	flushRecordSearch := func() {
		for _, p := range pendingRecordSearch {
			rid := strings.TrimSpace(p.recordID)
			if rid == "" {
				rid = "unknown"
			}
			messages[p.index] = openaigo.UserMessage(fmt.Sprintf(`<tool_result name="%s">[Session Record %s has read]</tool_result>`, opts.RecordSearchToolName, rid))
		}
		pendingRecordSearch = nil
	}

	for i := 0; i <= opts.MaxToolCalls; i++ {
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm call: channel=%s attempt=%d messages=%d", opts.LogPrefix, opts.ChannelID, i+1, len(messages))
		}
		logLLMMessages(opts.LogPrefix, opts.ChannelID, messages)
		openaiCfg, err := c.Config.OpenAIChatConfig()
		if err != nil {
			return "", memory.Mood{}, false, err
		}
		resp, err := llm.CallOpenAIChatCompletionWithRetry(ctx, c.HTTPClient, openaiCfg, messages, nil, llm.CallOpenAIChatCompletionWithRetryOptions{
			MaxRetries:     opts.MaxLLMRetries,
			InitialBackoff: opts.LLMRetryInitialBackoff,
			MaxBackoff:     opts.LLMRetryMaxBackoff,
			LogPrefix:      opts.LogPrefix,
			ChannelID:      opts.ChannelID,
		})
		if err != nil {
			return "", memory.Mood{}, false, err
		}
		if resp == nil || len(resp.Choices) == 0 {
			return "", memory.Mood{}, false, fmt.Errorf("llm returned empty choices")
		}
		msg := resp.Choices[0].Message
		out := stripLeadingMalformedToolDirectives(msg.Content, "<TOOL>")
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm output preview: channel=%s %q", opts.LogPrefix, opts.ChannelID, sdk.PreviewString(out, opts.LLMPreviewLen))
		}

		// Strip mood line (can appear before/after tool directives).
		outNoMood, _, _ := memory.ExtractAndStripFinalMood(out)
		outNoMood = stripInvalidToolCloseLines(outNoMood)

		cleanText, toolCalls := extractTrailingToolCalls(outNoMood, "<TOOL>")
		if len(toolCalls) > 0 && len(toolCalls) > opts.MaxToolCalls {
			toolCalls = toolCalls[:opts.MaxToolCalls]
		}

		if len(toolCalls) > 0 {
			cleanText = stripTrailingControlLines(cleanText, stripTrailingControlLinesOpts{
				SilenceToken:         opts.SilenceToken,
				WantMoreToken:        opts.WantMoreToken,
				ProactiveTokenPrefix: opts.ProactiveTokenPrefix,
				StickerTokenPrefix:   opts.StickerTokenPrefix,
			})
			if opts.OnToolCallAssistantText != nil && strings.TrimSpace(cleanText) != "" {
				if err := opts.OnToolCallAssistantText(strings.TrimSpace(cleanText)); err != nil {
					return "", memory.Mood{}, false, err
				}
			}
			if strings.TrimSpace(cleanText) != "" {
				messages = append(messages, openaigo.AssistantMessage(strings.TrimSpace(cleanText)))
			}

			for _, tc := range toolCalls {
				toolName := strings.TrimSpace(tc.Name)
				if strings.TrimSpace(opts.LogPrefix) != "" {
					b, _ := json.Marshal(tc.Args)
					log.Printf("%s tool call(text): channel=%s tool=%s args_json=%q", opts.LogPrefix, opts.ChannelID, toolName, sdk.PreviewString(string(b), opts.LLMPreviewLen))
				}

				var payload any
				var toolErr error
				switch toolName {
				case opts.HistorySearchToolName:
					if handlers.HistorySearch == nil {
						payload = map[string]any{"error": "tool handler not configured"}
						break
					}
					keyword, _ := tc.Args["keyword"].(string)
					if strings.TrimSpace(keyword) == "" {
						keyword, _ = tc.Args["query"].(string)
					}
					payload, toolErr = handlers.HistorySearch(ctx, keyword)
				case opts.RecordSearchToolName:
					if handlers.RecordSearch == nil {
						payload = map[string]any{"error": "tool handler not configured"}
						break
					}
					recordID, _ := tc.Args["record_id"].(string)
					if strings.TrimSpace(recordID) == "" {
						recordID, _ = tc.Args["recordId"].(string)
					}
					payload, toolErr = handlers.RecordSearch(ctx, recordID)
					if toolErr == nil {
						pendingRecordSearch = append(pendingRecordSearch, pendingRecordSearchResult{
							index:    len(messages),
							recordID: recordID,
						})
					}
				case opts.WebSearchToolName:
					if handlers.WebSearch == nil {
						payload = map[string]any{"error": "tool handler not configured"}
						break
					}
					query, _ := tc.Args["query"].(string)
					if strings.TrimSpace(query) == "" {
						query, _ = tc.Args["keyword"].(string)
					}
					payload, toolErr = handlers.WebSearch(ctx, query)
				default:
					payload = map[string]any{"error": "unknown tool: " + toolName}
				}
				if toolErr != nil {
					payload = map[string]any{"error": toolErr.Error()}
				}

				b, _ := json.Marshal(payload)
				toolResultText := fmt.Sprintf(`<tool_result name="%s">%s</tool_result>`, toolName, string(b))
				messages = append(messages, openaigo.UserMessage(toolResultText))
				if strings.TrimSpace(opts.LogPrefix) != "" {
					log.Printf("%s tool result(text): channel=%s tool=%s preview=%q",
						opts.LogPrefix, opts.ChannelID, toolName, sdk.PreviewString(string(b), opts.ToolResultPreviewLen),
					)
				}
			}
			continue
		}

		clean, mood, ok := memory.ExtractAndStripFinalMood(out)
		if ok && strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s final_mood parsed: channel=%s valence=%.4f arousal=%.4f", opts.LogPrefix, opts.ChannelID, mood.Valence, mood.Arousal)
		}
		// Only compress RecordSearch payloads after the model has produced a non-tool response.
		flushRecordSearch()
		return clean, mood, ok, nil
	}

	return "", memory.Mood{}, false, fmt.Errorf("tool loop exceeded")
}

type textToolCall struct {
	Name string
	Args map[string]any
}

var toolCloseTagLineRe = regexp.MustCompile(`(?m)^[\t ]*</TOOL>[\t ]*(\r?\n)?`)

func stripInvalidToolCloseLines(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}
	return toolCloseTagLineRe.ReplaceAllString(text, "")
}

func stripLeadingMalformedToolDirectives(text string, toolPrefix string) string {
	s := text
	for {
		trimmed := strings.TrimLeft(s, " \t\r\n")
		if strings.HasPrefix(trimmed, "</TOOL>") {
			s = consumeFirstLine(trimmed)
			continue
		}
		if toolPrefix != "" && strings.HasPrefix(trimmed, toolPrefix) {
			s = consumeFirstLine(trimmed)
			// Also strip an immediate closing tag line (common malformed variant).
			trimmed2 := strings.TrimLeft(s, " \t\r\n")
			if strings.HasPrefix(trimmed2, "</TOOL>") {
				s = consumeFirstLine(trimmed2)
			}
			continue
		}
		break
	}
	return stripInvalidToolCloseLines(s)
}

func consumeFirstLine(s string) string {
	if s == "" {
		return ""
	}
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[i+1:]
	}
	return ""
}

type stripTrailingControlLinesOpts struct {
	SilenceToken         string
	WantMoreToken        string
	ProactiveTokenPrefix string
	StickerTokenPrefix   string
}

func stripTrailingControlLines(text string, opts stripTrailingControlLinesOpts) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for {
		last := -1
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) != "" {
				last = i
				break
			}
		}
		if last < 0 {
			break
		}

		t := strings.TrimSpace(lines[last])
		switch {
		case opts.SilenceToken != "" && t == strings.TrimSpace(opts.SilenceToken):
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case opts.WantMoreToken != "" && t == strings.TrimSpace(opts.WantMoreToken):
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case opts.ProactiveTokenPrefix != "" && strings.HasPrefix(t, strings.TrimSpace(opts.ProactiveTokenPrefix)):
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case opts.StickerTokenPrefix != "" && strings.HasPrefix(t, strings.TrimSpace(opts.StickerTokenPrefix)):
			lines = append(lines[:last], lines[last+1:]...)
			continue
		default:
		}
		break
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func extractTrailingToolCalls(text string, prefix string) (clean string, calls []textToolCall) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	calls = nil

	for {
		last := -1
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) != "" {
				last = i
				break
			}
		}
		if last < 0 {
			break
		}

		t := strings.TrimSpace(lines[last])
		if !strings.HasPrefix(t, strings.TrimSpace(prefix)) {
			break
		}
		raw := strings.TrimSpace(strings.TrimPrefix(t, strings.TrimSpace(prefix)))
		if raw == "" {
			lines = append(lines[:last], lines[last+1:]...)
			continue
		}

		var obj map[string]any
		if json.Unmarshal([]byte(raw), &obj) != nil || obj == nil {
			lines = append(lines[:last], lines[last+1:]...)
			continue
		}

		name, _ := obj["name"].(string)
		if strings.TrimSpace(name) == "" {
			name, _ = obj["tool"].(string)
		}
		name = strings.TrimSpace(name)
		if name == "" {
			lines = append(lines[:last], lines[last+1:]...)
			continue
		}

		args := map[string]any{}
		if a, ok := obj["args"].(map[string]any); ok && a != nil {
			args = a
		} else {
			// Allow shorthand: {"name":"HistorySearch","keyword":"x"}
			for k, v := range obj {
				if k == "name" || k == "tool" || k == "args" {
					continue
				}
				args[k] = v
			}
		}

		calls = append(calls, textToolCall{Name: name, Args: args})
		lines = append(lines[:last], lines[last+1:]...)
		continue
	}

	// The scan is from the end, so calls are reversed (last -> first).
	for i, j := 0, len(calls)-1; i < j; i, j = i+1, j-1 {
		calls[i], calls[j] = calls[j], calls[i]
	}
	clean = strings.TrimSpace(strings.Join(lines, "\n"))
	return clean, calls
}

func logLLMMessages(logPrefix, channelID string, messages []openaigo.ChatCompletionMessageParamUnion) {
	if strings.TrimSpace(logPrefix) == "" {
		return
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	err := enc.Encode(messages)
	if err != nil {
		log.Printf("%s llm messages marshal failed: channel=%s err=%v", logPrefix, channelID, err)
		return
	}
	log.Printf("%s llm messages: channel=%s\n%s", logPrefix, channelID, strings.TrimSpace(buf.String()))
}
