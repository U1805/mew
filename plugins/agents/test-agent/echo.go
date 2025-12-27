package main

import (
	"context"
	"encoding/json"
	"strings"

	"mew/plugins/sdk/socketio"
)

type socketMessage struct {
	ChannelID string          `json:"channelId"`
	Content   string          `json:"content"`
	AuthorID  json.RawMessage `json:"authorId"`
}

func (r *TestAgentRunner) maybeEcho(ctx context.Context, channelID, content string) (reply string, ok bool, err error) {
	trimmed := strings.TrimSpace(content)

	// Channel: require a leading mention.
	if rest, mentioned := socketio.StripLeadingBotMention(trimmed, r.botUserID); mentioned {
		reply, ok := parseEcho(rest)
		return reply, ok, nil
	}

	// DM: no mention required, but must be in a DM channel.
	reply, ok = parseEcho(trimmed)
	if !ok {
		return "", false, nil
	}

	if r.dmChannels.Has(channelID) {
		return reply, true, nil
	}

	// DM channels can be created after the bot connects; refresh once on demand.
	if err := r.dmChannels.Refresh(ctx, r.httpClient, r.apiBase, r.userToken); err != nil {
		return "", false, err
	}
	if r.dmChannels.Has(channelID) {
		return reply, true, nil
	}
	return "", false, nil
}

func parseEcho(content string) (reply string, ok bool) {
	s := strings.TrimSpace(content)
	if s == "" {
		return "", false
	}
	if len(s) < 4 {
		return "", false
	}
	if !strings.EqualFold(s[:4], "echo") {
		return "", false
	}
	if len(s) == 4 {
		return "", false
	}
	next := s[4]
	if next != ' ' && next != '\t' && next != '\n' && next != '\r' {
		return "", false
	}
	rest := strings.TrimSpace(s[4:])
	if rest == "" {
		return "", false
	}
	return rest, true
}
