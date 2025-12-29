package client

import (
	"bytes"
	"encoding/json"
	"strings"
)

func AuthorID(authorRaw json.RawMessage) string {
	raw := bytes.TrimSpace(authorRaw)
	if len(raw) == 0 {
		return ""
	}

	if raw[0] == '"' {
		var id string
		if err := json.Unmarshal(raw, &id); err != nil {
			return ""
		}
		return strings.TrimSpace(id)
	}

	if raw[0] != '{' {
		return ""
	}
	var author struct {
		ID string `json:"_id"`
	}
	if err := json.Unmarshal(raw, &author); err != nil {
		return ""
	}
	return strings.TrimSpace(author.ID)
}

func AuthorUsername(authorRaw json.RawMessage) string {
	raw := bytes.TrimSpace(authorRaw)
	if len(raw) == 0 || raw[0] != '{' {
		return ""
	}

	var author struct {
		Username string `json:"username"`
	}
	if err := json.Unmarshal(raw, &author); err != nil {
		return ""
	}
	return strings.TrimSpace(author.Username)
}

func IsOwnMessage(authorRaw json.RawMessage, botUserID string) bool {
	authorID := AuthorID(authorRaw)
	if strings.TrimSpace(authorID) == "" {
		return false
	}
	return authorID == botUserID
}

func MentionIDs(mentionsRaw []json.RawMessage) []string {
	if len(mentionsRaw) == 0 {
		return nil
	}
	out := make([]string, 0, len(mentionsRaw))
	for _, m := range mentionsRaw {
		raw := bytes.TrimSpace(m)
		if len(raw) == 0 {
			continue
		}

		if raw[0] == '"' {
			var id string
			if err := json.Unmarshal(raw, &id); err != nil {
				continue
			}
			id = strings.TrimSpace(id)
			if id != "" {
				out = append(out, id)
			}
			continue
		}

		if raw[0] != '{' {
			continue
		}
		var obj struct {
			ID string `json:"_id"`
		}
		if err := json.Unmarshal(raw, &obj); err != nil {
			continue
		}
		id := strings.TrimSpace(obj.ID)
		if id != "" {
			out = append(out, id)
		}
	}
	return out
}
