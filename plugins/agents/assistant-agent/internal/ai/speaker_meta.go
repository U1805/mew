package ai

import (
	"fmt"
	"strings"
	"time"
)

func sanitizeMetaAttrValue(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\t", " ")
	s = strings.ReplaceAll(s, "\"", "'")
	s = strings.ReplaceAll(s, "<", "(")
	s = strings.ReplaceAll(s, ">", ")")
	s = strings.TrimSpace(s)
	if len(s) > 80 {
		s = s[:80]
		s = strings.TrimSpace(s)
	}
	return s
}

func SpeakerMetaLine(username, userID string, sentAt time.Time) string {
	u := sanitizeMetaAttrValue(username)
	id := sanitizeMetaAttrValue(userID)
	if u == "" {
		u = "unknown"
	}
	if id == "" {
		id = "unknown"
	}
	if !sentAt.IsZero() {
		// HH:MM precision only, no seconds.
		return fmt.Sprintf(`<mew_speaker username="%s" user_id="%s" time="%s"/>`, u, id, sentAt.Format("15:04"))
	}
	return fmt.Sprintf(`<mew_speaker username="%s" user_id="%s"/>`, u, id)
}

func WrapUserTextWithSpeakerMeta(username, userID string, sentAt time.Time, text string) string {
	text = strings.TrimSpace(text)
	meta := SpeakerMetaLine(username, userID, sentAt)
	if text == "" {
		return meta
	}
	return meta + "\n" + text
}
