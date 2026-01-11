package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/agent/chat"
	"mew/plugins/sdk/api/history"
)

func RunHistorySearch(ctx context.Context, fetcher *history.Fetcher, channelID, keyword string) (any, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return map[string]any{"messages": []any{}}, nil
	}
	if fetcher == nil {
		return nil, fmt.Errorf("history fetcher not configured")
	}
	msgs, err := fetcher.SearchHistory(ctx, channelID, keyword, 10)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		rid, err := fetcher.RecordIDForMessage(ctx, channelID, m.ID)
		recordID := ""
		if err == nil {
			recordID = rid
		}
		out = append(out, map[string]any{
			"id":        m.ID,
			"createdAt": m.CreatedAt.Format(time.RFC3339),
			"authorId":  m.AuthorID(),
			"author":    m.AuthorUsername(),
			"content":   m.ContextText(),
			"recordId":  recordID,
		})
	}
	return map[string]any{"keyword": keyword, "messages": out}, nil
}

func RunRecordSearch(ctx context.Context, fetcher *history.Fetcher, channelID, recordID string) (any, error) {
	if fetcher == nil {
		return nil, fmt.Errorf("history fetcher not configured")
	}
	msgs, err := fetcher.RecordSearch(ctx, channelID, recordID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"recordId": recordID,
		"text":     chat.FormatSessionRecordForContext(msgs),
	}, nil
}
