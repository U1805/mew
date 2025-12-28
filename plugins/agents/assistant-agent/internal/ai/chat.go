package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	openaigo "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	"github.com/openai/openai-go/v3/shared"

	"mew/plugins/assistant-agent/internal/config"
	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
)

type ToolHandlers struct {
	HistorySearch func(ctx context.Context, keyword string) (any, error)
	RecordSearch  func(ctx context.Context, recordID string) (any, error)
}

type ChatWithToolsOptions struct {
	MaxToolCalls          int
	HistorySearchToolName string
	RecordSearchToolName  string
	LogPrefix             string
	ChannelID             string
	LLMPreviewLen         int
	ToolResultPreviewLen  int
}

func ChatWithTools(
	ctx context.Context,
	httpClient *http.Client,
	cfg config.AssistantConfig,
	personaSystem string,
	firstUserPrompt string,
	l5 []openaigo.ChatCompletionMessageParamUnion,
	handlers ToolHandlers,
	opts ChatWithToolsOptions,
) (reply string, finalMood store.Mood, gotMood bool, err error) {
	if opts.MaxToolCalls <= 0 {
		opts.MaxToolCalls = 3
	}
	if strings.TrimSpace(opts.HistorySearchToolName) == "" {
		opts.HistorySearchToolName = "HistorySearch"
	}
	if strings.TrimSpace(opts.RecordSearchToolName) == "" {
		opts.RecordSearchToolName = "RecordSearch"
	}

	tools := []openaigo.ChatCompletionToolUnionParam{
		openaigo.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
			Name:        opts.HistorySearchToolName,
			Description: param.NewOpt("Search recent DM history by keyword and return matching messages + Session Record IDs."),
			Strict:      param.NewOpt(true),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"keyword": map[string]any{"type": "string", "description": "Search keyword."},
				},
				"required":             []string{"keyword"},
				"additionalProperties": false,
			},
		}),
		openaigo.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
			Name:        opts.RecordSearchToolName,
			Description: param.NewOpt("Load a full Session Record text by record_id."),
			Strict:      param.NewOpt(true),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"record_id": map[string]any{"type": "string", "description": "Session Record ID."},
				},
				"required":             []string{"record_id"},
				"additionalProperties": false,
			},
		}),
	}

	messages := make([]openaigo.ChatCompletionMessageParamUnion, 0, 2+len(l5)+opts.MaxToolCalls*4)
	messages = append(messages,
		openaigo.SystemMessage(strings.TrimSpace(personaSystem)),
		openaigo.UserMessage(strings.TrimSpace(firstUserPrompt)),
	)
	messages = append(messages, l5...)

	type pendingRecordSearchResult struct {
		index    int
		callID   string
		recordID string
	}
	var pendingRecordSearch []pendingRecordSearchResult
	flushRecordSearch := func() {
		for _, p := range pendingRecordSearch {
			rid := strings.TrimSpace(p.recordID)
			if rid == "" {
				rid = "unknown"
			}
			payload := map[string]any{
				"recordId": rid,
				"text":     fmt.Sprintf("[Session Record %s has read]", rid),
			}
			b, _ := json.Marshal(payload)
			messages[p.index] = openaigo.ToolMessage(string(b), p.callID)
		}
		pendingRecordSearch = nil
	}

	for i := 0; i <= opts.MaxToolCalls; i++ {
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm call: channel=%s attempt=%d messages=%d", opts.LogPrefix, opts.ChannelID, i+1, len(messages))
		}
		logLLMMessages(opts.LogPrefix, opts.ChannelID, messages)
		resp, err := CallChatCompletion(ctx, httpClient, cfg, messages, tools)
		if err != nil {
			return "", store.Mood{}, false, err
		}
		if resp == nil || len(resp.Choices) == 0 {
			return "", store.Mood{}, false, fmt.Errorf("llm returned empty choices")
		}
		msg := resp.Choices[0].Message
		out := msg.Content
		if strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s llm output preview: channel=%s %q", opts.LogPrefix, opts.ChannelID, sdk.PreviewString(out, opts.LLMPreviewLen))
		}

		if len(msg.ToolCalls) > 0 {
			messages = append(messages, msg.ToParam())

			for _, tc := range msg.ToolCalls {
				if strings.TrimSpace(tc.Type) != "function" {
					b, _ := json.Marshal(tc)
					messages = append(messages, openaigo.ToolMessage(string(b), tc.ID))
					continue
				}
				call := tc.AsFunction()
				toolName := strings.TrimSpace(call.Function.Name)
				if strings.TrimSpace(opts.LogPrefix) != "" {
					log.Printf("%s tool call: channel=%s tool=%s args_json=%q", opts.LogPrefix, opts.ChannelID, toolName, sdk.PreviewString(call.Function.Arguments, opts.LLMPreviewLen))
				}

				var args map[string]any
				_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
				if args == nil {
					args = map[string]any{}
				}

				var payload any
				var toolErr error
				switch toolName {
				case opts.HistorySearchToolName:
					if handlers.HistorySearch == nil {
						payload = map[string]any{"error": "tool handler not configured"}
						break
					}
					keyword, _ := args["keyword"].(string)
					if strings.TrimSpace(keyword) == "" {
						keyword, _ = args["query"].(string)
					}
					payload, toolErr = handlers.HistorySearch(ctx, keyword)
				case opts.RecordSearchToolName:
					if handlers.RecordSearch == nil {
						payload = map[string]any{"error": "tool handler not configured"}
						break
					}
					recordID, _ := args["record_id"].(string)
					if strings.TrimSpace(recordID) == "" {
						recordID, _ = args["recordId"].(string)
					}
					payload, toolErr = handlers.RecordSearch(ctx, recordID)
					if toolErr == nil {
						pendingRecordSearch = append(pendingRecordSearch, pendingRecordSearchResult{
							index:    len(messages),
							callID:   tc.ID,
							recordID: recordID,
						})
					}
				default:
					payload = map[string]any{"error": "unknown tool: " + toolName}
				}
				if toolErr != nil {
					payload = map[string]any{"error": toolErr.Error()}
				}

				b, _ := json.Marshal(payload)
				messages = append(messages, openaigo.ToolMessage(string(b), tc.ID))
				if strings.TrimSpace(opts.LogPrefix) != "" {
					log.Printf("%s tool result: channel=%s tool=%s preview=%q",
						opts.LogPrefix, opts.ChannelID, toolName, sdk.PreviewString(string(b), opts.ToolResultPreviewLen),
					)
				}
			}
			continue
		}

		clean, mood, ok := store.ExtractAndStripFinalMood(out)
		if ok && strings.TrimSpace(opts.LogPrefix) != "" {
			log.Printf("%s final_mood parsed: channel=%s valence=%.4f arousal=%.4f", opts.LogPrefix, opts.ChannelID, mood.Valence, mood.Arousal)
		}
		// Only compress RecordSearch payloads after the model has produced a non-tool response.
		flushRecordSearch()
		return clean, mood, ok, nil
	}

	return "", store.Mood{}, false, fmt.Errorf("tool loop exceeded")
}

func logLLMMessages(logPrefix, channelID string, messages []openaigo.ChatCompletionMessageParamUnion) {
	if strings.TrimSpace(logPrefix) == "" {
		return
	}
	b, err := json.MarshalIndent(messages, "", "  ")
	if err != nil {
		log.Printf("%s llm messages marshal failed: channel=%s err=%v", logPrefix, channelID, err)
		return
	}
	log.Printf("%s llm messages: channel=%s\n%s", logPrefix, channelID, string(b))
}
