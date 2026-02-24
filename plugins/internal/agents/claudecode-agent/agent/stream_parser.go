package agent

import (
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
)

var toolUseErrorPattern = regexp.MustCompile(`(?s)<tool_use_error>(.*?)</tool_use_error>`)

type ClaudeStreamParser struct {
	currentAssistant *assistantBuilder
	currentBlock     *contentBlockBuilder

	pendingByToolUseID map[string]*pendingTurn
	pendingFinalText   string
}

type assistantBuilder struct {
	ID       string
	Text     strings.Builder
	ToolUses []toolUse
}

type contentBlockBuilder struct {
	BlockType   string
	Text        strings.Builder
	ToolUseID   string
	ToolUseName string
	PartialJSON strings.Builder
}

type toolUse struct {
	ID    string
	Name  string
	Input map[string]any
}

type toolResult struct {
	ToolUseID string
	IsError   bool
	ErrorText string
	Stdout    string
	NumLines  int
}

type pendingTurn struct {
	Text    string
	ToolUse toolUse
}

func NewClaudeStreamParser() *ClaudeStreamParser {
	return &ClaudeStreamParser{
		pendingByToolUseID: make(map[string]*pendingTurn),
	}
}

func (p *ClaudeStreamParser) FeedLine(line string) ([]string, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, nil
	}

	var kind struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(line), &kind); err != nil {
		return nil, err
	}

	switch kind.Type {
	case "stream_event":
		return p.handleStreamEvent(line)
	case "user":
		return p.handleUserToolResult(line)
	case "result":
		return p.handleFinalResult(line)
	case "system", "assistant":
		return nil, nil
	case "proxy_error":
		var e struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			return []string{line}, nil
		}
		msg := strings.TrimSpace(e.Error)
		if msg == "" {
			msg = line
		}
		return []string{fmt.Sprintf("claude-code 调用失败: %s", msg)}, nil
	default:
		return []string{line}, nil
	}
}

func (p *ClaudeStreamParser) Flush() []string {
	if strings.TrimSpace(p.pendingFinalText) == "" {
		return nil
	}
	out := p.pendingFinalText
	p.pendingFinalText = ""
	return []string{out}
}

func (p *ClaudeStreamParser) handleStreamEvent(line string) ([]string, error) {
	var ev struct {
		Type  string `json:"type"`
		Event struct {
			Type    string `json:"type"`
			Message struct {
				ID string `json:"id"`
			} `json:"message"`
			ContentBlock struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
		} `json:"event"`
	}
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		return nil, err
	}

	switch ev.Event.Type {
	case "message_start":
		p.currentAssistant = &assistantBuilder{ID: strings.TrimSpace(ev.Event.Message.ID)}
	case "content_block_start":
		p.currentBlock = &contentBlockBuilder{
			BlockType:   strings.TrimSpace(ev.Event.ContentBlock.Type),
			ToolUseID:   strings.TrimSpace(ev.Event.ContentBlock.ID),
			ToolUseName: strings.TrimSpace(ev.Event.ContentBlock.Name),
		}
	case "content_block_delta":
		if p.currentBlock == nil {
			return nil, nil
		}
		switch p.currentBlock.BlockType {
		case "text":
			p.currentBlock.Text.WriteString(ev.Event.Delta.Text)
		case "tool_use":
			p.currentBlock.PartialJSON.WriteString(ev.Event.Delta.PartialJSON)
		}
	case "content_block_stop":
		if p.currentAssistant == nil || p.currentBlock == nil {
			p.currentBlock = nil
			return nil, nil
		}
		switch p.currentBlock.BlockType {
		case "text":
			// With --include-partial-messages, Claude may append replay text
			// after tool_use in the same turn (e.g. [User] <tool_result ...>).
			// For tool turns, keep only pre-tool narrative text.
			if len(p.currentAssistant.ToolUses) == 0 {
				p.currentAssistant.Text.WriteString(p.currentBlock.Text.String())
			}
		case "tool_use":
			input := map[string]any{}
			raw := strings.TrimSpace(p.currentBlock.PartialJSON.String())
			if raw != "" {
				_ = json.Unmarshal([]byte(raw), &input)
			}
			p.currentAssistant.ToolUses = append(p.currentAssistant.ToolUses, toolUse{
				ID:    p.currentBlock.ToolUseID,
				Name:  p.currentBlock.ToolUseName,
				Input: input,
			})
		}
		p.currentBlock = nil
	case "message_stop":
		p.finalizeAssistantTurn()
	}

	return nil, nil
}

func (p *ClaudeStreamParser) finalizeAssistantTurn() {
	if p.currentAssistant == nil {
		return
	}

	text := strings.TrimSpace(p.currentAssistant.Text.String())
	if len(p.currentAssistant.ToolUses) == 0 {
		if text != "" {
			p.pendingFinalText = text
		}
		p.currentAssistant = nil
		return
	}

	for i, tu := range p.currentAssistant.ToolUses {
		turnText := text
		if i > 0 {
			turnText = ""
		}
		if strings.TrimSpace(tu.ID) == "" {
			continue
		}
		p.pendingByToolUseID[tu.ID] = &pendingTurn{
			Text:    turnText,
			ToolUse: tu,
		}
	}
	p.currentAssistant = nil
}

func (p *ClaudeStreamParser) handleUserToolResult(line string) ([]string, error) {
	var u struct {
		Type          string          `json:"type"`
		ToolUseResult json.RawMessage `json:"tool_use_result"`
		Message       struct {
			Content []struct {
				Type      string          `json:"type"`
				ToolUseID string          `json:"tool_use_id"`
				Content   json.RawMessage `json:"content"`
				IsError   bool            `json:"is_error"`
			} `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal([]byte(line), &u); err != nil {
		return nil, err
	}

	var result toolResult
	for _, c := range u.Message.Content {
		if strings.TrimSpace(c.ToolUseID) != "" {
			result.ToolUseID = strings.TrimSpace(c.ToolUseID)
		}
		if c.IsError {
			result.IsError = true
		}
		contentText := decodeMaybeString(c.Content)
		if extracted := extractToolUseError(contentText); extracted != "" {
			result.IsError = true
			result.ErrorText = extracted
		}
	}
	if result.ToolUseID == "" {
		return nil, nil
	}

	populateToolResultFromRaw(&result, u.ToolUseResult)
	if result.IsError && strings.TrimSpace(result.ErrorText) == "" {
		result.ErrorText = "工具调用失败"
	}

	turn, ok := p.pendingByToolUseID[result.ToolUseID]
	if !ok {
		return nil, nil
	}
	delete(p.pendingByToolUseID, result.ToolUseID)

	msg := formatTurnMessage(turn.Text, turn.ToolUse, result)
	if strings.TrimSpace(msg) == "" {
		return nil, nil
	}
	return []string{msg}, nil
}

func (p *ClaudeStreamParser) handleFinalResult(line string) ([]string, error) {
	var r struct {
		Type         string  `json:"type"`
		Subtype      string  `json:"subtype"`
		Result       string  `json:"result"`
		DurationMS   int64   `json:"duration_ms"`
		TotalCostUSD float64 `json:"total_cost_usd"`
		Usage        struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal([]byte(line), &r); err != nil {
		return nil, err
	}
	if strings.TrimSpace(r.Subtype) != "success" {
		return nil, nil
	}

	body := strings.TrimSpace(p.pendingFinalText)
	if body == "" {
		body = strings.TrimSpace(r.Result)
	}
	p.pendingFinalText = ""

	footer := formatUsageFooter(r.DurationMS, r.TotalCostUSD, r.Usage.InputTokens, r.Usage.OutputTokens)
	if body == "" && footer == "" {
		return nil, nil
	}
	if body == "" {
		return []string{footer}, nil
	}
	if footer == "" {
		return []string{body}, nil
	}
	return []string{body + "\n\n" + footer}, nil
}

func populateToolResultFromRaw(res *toolResult, raw json.RawMessage) {
	raw = []byte(strings.TrimSpace(string(raw)))
	if len(raw) == 0 || string(raw) == "null" {
		return
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		txt := strings.TrimSpace(asString)
		if strings.HasPrefix(strings.ToLower(txt), "error:") {
			res.IsError = true
			txt = strings.TrimSpace(txt[len("error:"):])
		}
		if txt != "" && res.ErrorText == "" && res.IsError {
			res.ErrorText = txt
		}
		return
	}

	var obj struct {
		Stdout string `json:"stdout"`
		Stderr string `json:"stderr"`
		File   struct {
			NumLines int `json:"numLines"`
		} `json:"file"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		if strings.TrimSpace(obj.Stdout) != "" {
			res.Stdout = strings.TrimSpace(obj.Stdout)
		}
		if obj.File.NumLines > 0 {
			res.NumLines = obj.File.NumLines
		}
		if strings.TrimSpace(obj.Stderr) != "" {
			res.IsError = true
			if res.ErrorText == "" {
				res.ErrorText = strings.TrimSpace(obj.Stderr)
			}
		}
	}
}

func formatTurnMessage(text string, tu toolUse, result toolResult) string {
	header := strings.TrimSpace(text)
	action := formatToolAction(tu, result)
	if header == "" {
		return action
	}
	if action == "" {
		return header
	}
	return header + "\n\n" + action
}

func formatToolAction(tu toolUse, result toolResult) string {
	switch strings.ToLower(strings.TrimSpace(tu.Name)) {
	case "write":
		file := baseNameFromInput(tu.Input, "file_path")
		if file == "" {
			file = "unknown"
		}
		if result.IsError {
			return fmt.Sprintf("> 写入文件 %s\n> \n> 系统拦截 %s", file, sanitizeLine(result.ErrorText))
		}
		return fmt.Sprintf("> 写入文件 %s\n> \n> 写入成功", file)
	case "read":
		file := baseNameFromInput(tu.Input, "file_path")
		if file == "" {
			file = "unknown"
		}
		if result.IsError {
			return fmt.Sprintf("> 读取文件 %s\n> \n> 系统拦截 %s", file, sanitizeLine(result.ErrorText))
		}
		if result.NumLines > 0 {
			return fmt.Sprintf("> 读取文件 %s\n> \n> 读取成功 (包含 %d 行代码)", file, result.NumLines)
		}
		return fmt.Sprintf("> 读取文件 %s\n> \n> 读取成功", file)
	case "bash":
		cmd := sanitizeLine(stringFromInput(tu.Input, "command"))
		if cmd == "" {
			cmd = "(empty command)"
		}
		if result.IsError {
			return fmt.Sprintf("> 执行终端命令\n%s\n>\n> 系统拦截 %s", cmd, sanitizeLine(result.ErrorText))
		}
		stdout := strings.TrimSpace(result.Stdout)
		if stdout == "" {
			return fmt.Sprintf("> 执行终端命令\n%s\n>\n> (无输出)", cmd)
		}
		return fmt.Sprintf("> 执行终端命令\n%s\n>\n> ```\n%s\n> ```", cmd, toBlockQuoteLines(stdout))
	default:
		if result.IsError {
			return fmt.Sprintf("> 执行工具 %s\n> \n> 系统拦截 %s", sanitizeLine(tu.Name), sanitizeLine(result.ErrorText))
		}
		return fmt.Sprintf("> 执行工具 %s\n> \n> 调用成功", sanitizeLine(tu.Name))
	}
}

func formatUsageFooter(durationMS int64, cost float64, inTokens, outTokens int64) string {
	duration := float64(durationMS) / 1000.0
	return fmt.Sprintf(
		"> ⏱️ %.1fs  |  🪙 预估 $%.2f  |  📊 IN: %s / OUT: %s tokens",
		duration,
		cost,
		abbrevTokens(inTokens),
		abbrevTokens(outTokens),
	)
}

func abbrevTokens(v int64) string {
	if v >= 1000 {
		f := float64(v) / 1000.0
		s := strconv.FormatFloat(f, 'f', 1, 64)
		return strings.TrimSuffix(s, ".0") + "k"
	}
	return strconv.FormatInt(v, 10)
}

func baseNameFromInput(input map[string]any, key string) string {
	v := strings.TrimSpace(stringFromInput(input, key))
	if v == "" {
		return ""
	}
	return path.Base(v)
}

func stringFromInput(input map[string]any, key string) string {
	if input == nil {
		return ""
	}
	v, ok := input[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", t))
	}
}

func decodeMaybeString(raw json.RawMessage) string {
	raw = []byte(strings.TrimSpace(string(raw)))
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(string(raw))
}

func extractToolUseError(text string) string {
	if strings.TrimSpace(text) == "" {
		return ""
	}
	m := toolUseErrorPattern.FindStringSubmatch(text)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func sanitizeLine(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "\r", " "), "\n", " "))
}

func toBlockQuoteLines(s string) string {
	lines := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	for i := range lines {
		lines[i] = "> " + lines[i]
	}
	return strings.Join(lines, "\n")
}
