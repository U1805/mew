package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ChannelMessage struct {
	ID          string          `json:"_id"`
	ChannelID   string          `json:"channelId"`
	Content     string          `json:"content"`
	Attachments []AttachmentRef `json:"attachments"`
	// Mentions is an array of mentioned user IDs. Depending on backend populate behavior, items may be strings or objects.
	MentionsRaw []json.RawMessage `json:"mentions"`
	CreatedAt   time.Time         `json:"createdAt"`
	AuthorRaw   json.RawMessage   `json:"authorId"`
	Type        string            `json:"type"`
}

func (m ChannelMessage) AuthorID() string { return AuthorID(m.AuthorRaw) }

func (m ChannelMessage) AuthorUsername() string { return AuthorUsername(m.AuthorRaw) }

func FetchChannelMessages(ctx context.Context, httpClient *http.Client, apiBase, userToken, channelID string, limit int, before string) ([]ChannelMessage, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("httpClient is required")
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 100 {
		limit = 100
	}

	u, err := url.Parse(strings.TrimRight(apiBase, "/") + "/channels/" + channelID + "/messages")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("limit", strconv.Itoa(limit))
	if strings.TrimSpace(before) != "" {
		q.Set("before", before)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+userToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var msgs []ChannelMessage
	if err := json.Unmarshal(body, &msgs); err != nil {
		return nil, err
	}
	for i := range msgs {
		for j := range msgs[i].Attachments {
			msgs[i].Attachments[j].ChannelID = msgs[i].ChannelID
		}
	}
	return msgs, nil
}

func SearchChannelMessages(ctx context.Context, httpClient *http.Client, apiBase, userToken, channelID, query string, limit, page int) ([]ChannelMessage, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("httpClient is required")
	}
	if limit <= 0 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	u, err := url.Parse(strings.TrimRight(apiBase, "/") + "/channels/" + channelID + "/search")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("q", query)
	q.Set("limit", strconv.Itoa(limit))
	q.Set("page", strconv.Itoa(page))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+userToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		Messages []ChannelMessage `json:"messages"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		// Some deployments might return a plain array.
		var msgs []ChannelMessage
		if err2 := json.Unmarshal(body, &msgs); err2 != nil {
			return nil, err
		}
		parsed.Messages = msgs
	}

	for i := range parsed.Messages {
		for j := range parsed.Messages[i].Attachments {
			parsed.Messages[i].Attachments[j].ChannelID = parsed.Messages[i].ChannelID
		}
	}
	return parsed.Messages, nil
}

func ParseChannelMessage(payload json.RawMessage) (ChannelMessage, bool) {
	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		return ChannelMessage{}, false
	}
	var msg ChannelMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return ChannelMessage{}, false
	}
	for i := range msg.Attachments {
		msg.Attachments[i].ChannelID = msg.ChannelID
	}
	return msg, true
}
