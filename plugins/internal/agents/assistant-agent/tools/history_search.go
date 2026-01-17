package tools

import (
	"fmt"
	"strings"
	"time"

	"mew/plugins/internal/agents/assistant-agent/agentctx"
	"mew/plugins/internal/agents/assistant-agent/chat"
)

func RunHistorySearch(c agentctx.HistoryCallContext, channelID, keyword string) (any, error) {
	ctx := agentctx.ContextOrBackground(c.Ctx)

	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return map[string]any{"messages": []any{}}, nil
	}
	if c.Fetcher == nil {
		return nil, fmt.Errorf("history fetcher not configured")
	}
	msgs, err := c.Fetcher.SearchHistory(ctx, channelID, keyword, 10)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		rid, err := c.Fetcher.RecordIDForMessage(ctx, channelID, m.ID)
		recordID := ""
		if err == nil {
			recordID = rid
		}

		createdAt := m.CreatedAt
		if c.TimeLoc != nil && !createdAt.IsZero() {
			createdAt = createdAt.In(c.TimeLoc)
		}
		out = append(out, map[string]any{
			"id":        m.ID,
			"createdAt": createdAt.Format(time.RFC3339),
			"authorId":  m.AuthorID(),
			"author":    m.AuthorUsername(),
			"content":   m.ContextText(),
			"recordId":  recordID,
		})
	}
	return map[string]any{"keyword": keyword, "messages": out}, nil
}

func RunRecordSearch(c agentctx.HistoryCallContext, channelID, recordID string) (any, error) {
	ctx := agentctx.ContextOrBackground(c.Ctx)

	if c.Fetcher == nil {
		return nil, fmt.Errorf("history fetcher not configured")
	}
	msgs, err := c.Fetcher.RecordSearch(ctx, channelID, recordID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"recordId": recordID,
		"text":     chat.FormatSessionRecordForContext(msgs, c.TimeLoc),
	}, nil
}
