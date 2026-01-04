package mew

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mew/plugins/sdk"
	"mew/plugins/sdk/client"
)

type Fetcher struct {
	HTTPClient *http.Client
	APIBase    string
	UserToken  string

	PageSize int
	MaxPages int

	SessionGap         time.Duration
	MaxSessionMessages int
}

func (f *Fetcher) withDefaults() *Fetcher {
	out := *f
	if out.PageSize <= 0 {
		out.PageSize = defaultPageSize
	}
	if out.MaxPages <= 0 {
		out.MaxPages = defaultMaxPages
	}
	if out.SessionGap <= 0 {
		out.SessionGap = defaultSessionGap
	}
	if out.MaxSessionMessages <= 0 {
		out.MaxSessionMessages = defaultMaxSessionMessages
	}
	return &out
}

func (f *Fetcher) FetchSessionMessages(ctx context.Context, channelID string) (sessionMsgs []Message, recordID string, startAt time.Time, err error) {
	f = f.withDefaults()
	var desc []Message
	before := ""

	for page := 0; page < f.MaxPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, f.HTTPClient, f.APIBase, f.UserToken, channelID, f.PageSize, before)
		if err != nil {
			return nil, "", time.Time{}, err
		}
		if len(msgs) == 0 {
			break
		}
		before = msgs[len(msgs)-1].ID
		msgs = filterRetractedMessages(msgs)
		desc = append(desc, msgs...)

		curCount, boundaryFound := client.CurrentSessionCountInDesc(desc, f.SessionGap, f.MaxSessionMessages)
		if curCount >= f.MaxSessionMessages || boundaryFound {
			desc = desc[:curCount]
			break
		}
	}

	if len(desc) == 0 {
		return nil, "", time.Time{}, fmt.Errorf("no messages in channel=%s", channelID)
	}

	client.ReverseMessagesInPlace(desc)
	if len(desc) > f.MaxSessionMessages {
		desc = desc[len(desc)-f.MaxSessionMessages:]
	}
	sessionMsgs = desc
	recordID = sessionMsgs[0].ID
	startAt = sessionMsgs[0].CreatedAt
	if startAt.IsZero() {
		startAt = time.Now()
	}
	return sessionMsgs, recordID, startAt, nil
}

func (f *Fetcher) RecordSearch(ctx context.Context, channelID, recordID string) ([]Message, error) {
	f = f.withDefaults()
	recordID = strings.TrimSpace(recordID)
	if recordID == "" {
		return nil, fmt.Errorf("record_id is required")
	}
	var desc []Message
	before := ""
	for page := 0; page < f.MaxPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, f.HTTPClient, f.APIBase, f.UserToken, channelID, f.PageSize, before)
		if err != nil {
			return nil, err
		}
		if len(msgs) == 0 {
			break
		}
		before = msgs[len(msgs)-1].ID
		msgs = filterRetractedMessages(msgs)
		desc = append(desc, msgs...)

		chrono := append([]Message(nil), desc...)
		client.ReverseMessagesInPlace(chrono)
		sessions := client.SplitSessionsChronological(chrono, f.SessionGap)
		if s := client.FindSessionByRecordID(sessions, recordID); len(s) > 0 {
			return s, nil
		}
	}
	return nil, fmt.Errorf("record not found (record_id=%s)", recordID)
}

func (f *Fetcher) RecordIDForMessage(ctx context.Context, channelID, messageID string) (string, error) {
	f = f.withDefaults()
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return "", fmt.Errorf("message_id is required")
	}
	var desc []Message
	before := ""
	for page := 0; page < f.MaxPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, f.HTTPClient, f.APIBase, f.UserToken, channelID, f.PageSize, before)
		if err != nil {
			return "", err
		}
		if len(msgs) == 0 {
			break
		}
		before = msgs[len(msgs)-1].ID
		msgs = filterRetractedMessages(msgs)
		desc = append(desc, msgs...)

		chrono := append([]Message(nil), desc...)
		client.ReverseMessagesInPlace(chrono)
		sessions := client.SplitSessionsChronological(chrono, f.SessionGap)
		for _, s := range sessions {
			for _, m := range s {
				if m.ID == messageID {
					if len(s) > 0 {
						return s[0].ID, nil
					}
				}
			}
		}
	}
	return "", fmt.Errorf("message not found (message_id=%s)", messageID)
}

func (f *Fetcher) SearchHistory(ctx context.Context, channelID, keyword string, limit int) ([]Message, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return []Message{}, nil
	}
	if limit <= 0 {
		limit = 10
	}
	msgs, err := sdk.SearchChannelMessages(ctx, f.HTTPClient, f.APIBase, f.UserToken, channelID, keyword, limit, 1)
	if err != nil {
		return nil, err
	}
	return filterRetractedMessages(msgs), nil
}

func (f *Fetcher) UserActivityFrequency(ctx context.Context, channelID, userID string, asOf time.Time) (string, error) {
	f = f.withDefaults()
	windows := userActivityWindows
	if asOf.IsZero() {
		asOf = time.Now()
	}
	loc := asOf.Location()
	startOfToday := time.Date(asOf.Year(), asOf.Month(), asOf.Day(), 0, 0, 0, 0, loc)
	windowStart := startOfToday.AddDate(0, 0, -(maxUserActivityWindowDays - 1))

	activeDayStarts := map[string]time.Time{}
	before := ""
	for page := 0; page < f.MaxPages; page++ {
		msgs, err := sdk.FetchChannelMessages(ctx, f.HTTPClient, f.APIBase, f.UserToken, channelID, f.PageSize, before)
		if err != nil {
			return "", err
		}
		if len(msgs) == 0 {
			break
		}
		before = msgs[len(msgs)-1].ID

		for _, m := range filterRetractedMessages(msgs) {
			if strings.TrimSpace(m.AuthorID()) != strings.TrimSpace(userID) {
				continue
			}
			if m.CreatedAt.IsZero() {
				continue
			}
			t := m.CreatedAt.In(loc)
			if t.Before(windowStart) {
				continue
			}
			if t.After(asOf) {
				continue
			}
			dayStart := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
			activeDayStarts[dayStart.Format("2006-01-02")] = dayStart
		}

		oldest := msgs[len(msgs)-1].CreatedAt
		if !oldest.IsZero() && oldest.In(loc).Before(windowStart) {
			break
		}
	}

	parts := make([]string, 0, len(windows))
	for _, w := range windows {
		if w <= 0 {
			continue
		}
		ws := startOfToday.AddDate(0, 0, -(w - 1))
		active := 0
		for _, dayStart := range activeDayStarts {
			if dayStart.Before(ws) || dayStart.After(startOfToday) {
				continue
			}
			active++
		}
		parts = append(parts, fmt.Sprintf("Active %d %s in the last %d", active, pluralize(active, "day", "days"), w))
	}
	return strings.Join(parts, "; "), nil
}

func pluralize(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}

func filterRetractedMessages(msgs []Message) []Message {
	if len(msgs) == 0 {
		return msgs
	}
	out := msgs[:0]
	for _, m := range msgs {
		if m.RetractedAt != nil {
			continue
		}
		out = append(out, m)
	}
	return out
}
