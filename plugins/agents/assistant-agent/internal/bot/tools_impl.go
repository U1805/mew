package bot

import (
	"context"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/ai"
)

func (r *Runner) runHistorySearch(ctx context.Context, channelID, keyword string) (any, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return map[string]any{"messages": []any{}}, nil
	}
	msgs, err := r.fetcher.SearchHistory(ctx, channelID, keyword, 10)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		rid, err := r.fetcher.RecordIDForMessage(ctx, channelID, m.ID)
		recordID := ""
		if err == nil {
			recordID = rid
		}
		out = append(out, map[string]any{
			"id":        m.ID,
			"createdAt": m.CreatedAt.Format(time.RFC3339),
			"authorId":  m.AuthorID(),
			"author":    m.AuthorUsername(),
			"content":   m.Content,
			"recordId":  recordID,
		})
	}
	return map[string]any{"keyword": keyword, "messages": out}, nil
}

func (r *Runner) runRecordSearch(ctx context.Context, channelID, recordID string) (any, error) {
	msgs, err := r.fetcher.RecordSearch(ctx, channelID, recordID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"recordId": recordID,
		"text":     ai.FormatSessionRecordForContext(msgs),
	}, nil
}
