package mew

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
