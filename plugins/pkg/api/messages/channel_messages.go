package messages

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

	sdkapi "mew/plugins/pkg/api"
)

func FetchChannelMessages(ctx context.Context, httpClient *http.Client, apiBase, userToken, channelID string, limit int, before string) ([]sdkapi.ChannelMessage, error) {
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
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+userToken)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var msgs []sdkapi.ChannelMessage
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

func SearchChannelMessages(ctx context.Context, httpClient *http.Client, apiBase, userToken, channelID, query string, limit, page int) ([]sdkapi.ChannelMessage, error) {
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
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+userToken)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var parsed struct {
		Messages []sdkapi.ChannelMessage `json:"messages"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		// Some deployments might return a plain array.
		var msgs []sdkapi.ChannelMessage
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

func ParseChannelMessage(payload json.RawMessage) (sdkapi.ChannelMessage, bool) {
	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		return sdkapi.ChannelMessage{}, false
	}
	var msg sdkapi.ChannelMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return sdkapi.ChannelMessage{}, false
	}
	for i := range msg.Attachments {
		msg.Attachments[i].ChannelID = msg.ChannelID
	}
	return msg, true
}
