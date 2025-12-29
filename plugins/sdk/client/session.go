package client

import "time"

func ReverseMessagesInPlace(msgs []ChannelMessage) {
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
}

// SplitSessionsChronological groups chronological messages into sessions separated by gap.
func SplitSessionsChronological(msgs []ChannelMessage, gap time.Duration) [][]ChannelMessage {
	if len(msgs) == 0 {
		return nil
	}
	out := make([][]ChannelMessage, 0, 8)
	start := 0
	for i := 1; i < len(msgs); i++ {
		prev := msgs[i-1].CreatedAt
		cur := msgs[i].CreatedAt
		if !prev.IsZero() && !cur.IsZero() && cur.Sub(prev) > gap {
			out = append(out, append([]ChannelMessage(nil), msgs[start:i]...))
			start = i
		}
	}
	out = append(out, append([]ChannelMessage(nil), msgs[start:]...))
	return out
}

// FindSessionByRecordID returns the first session containing recordID.
func FindSessionByRecordID(sessions [][]ChannelMessage, recordID string) []ChannelMessage {
	for _, s := range sessions {
		if len(s) == 0 {
			continue
		}
		if s[0].ID == recordID {
			return s
		}
		for _, m := range s {
			if m.ID == recordID {
				return s
			}
		}
	}
	return nil
}

// CurrentSessionCountInDesc returns how many messages from the start of desc belong to the current session.
//
// desc must be in reverse chronological order (newest first).
func CurrentSessionCountInDesc(desc []ChannelMessage, gap time.Duration, maxMessages int) (count int, boundaryFound bool) {
	if len(desc) == 0 {
		return 0, false
	}
	if maxMessages <= 0 {
		maxMessages = len(desc)
	}

	count = 1
	for i := 0; i+1 < len(desc); i++ {
		a := desc[i].CreatedAt
		b := desc[i+1].CreatedAt
		if !a.IsZero() && !b.IsZero() && a.Sub(b) > gap {
			return count, true
		}
		count++
		if count >= maxMessages {
			return count, false
		}
	}
	return count, false
}
