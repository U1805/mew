package messages

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"

	sdkapi "mew/plugins/pkg/api"
)

type SendVoiceMessageOptions struct {
	// PlainText is optional sender-provided transcript for bots.
	PlainText string

	// DurationMs is optional audio duration (milliseconds).
	DurationMs int
}

type uploadResponse struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
}

func SendVoiceMessageByUploadBytes(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID string,
	filename, contentType string,
	data []byte,
	opts SendVoiceMessageOptions,
) (sdkapi.ChannelMessage, error) {
	return SendVoiceMessageByUploadReader(ctx, httpClient, apiBase, userToken, channelID, filename, contentType, bytes.NewReader(data), opts)
}

// SendVoiceMessageByUploadReader uploads an audio file to `/api/channels/:channelId/uploads`
// then creates a `message/voice` message referencing the uploaded key.
func SendVoiceMessageByUploadReader(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID string,
	filename, contentType string,
	r io.Reader,
	opts SendVoiceMessageOptions,
) (sdkapi.ChannelMessage, error) {
	if httpClient == nil {
		return sdkapi.ChannelMessage{}, fmt.Errorf("httpClient is required")
	}
	apiBase = strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if apiBase == "" {
		return sdkapi.ChannelMessage{}, fmt.Errorf("apiBase is required")
	}
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return sdkapi.ChannelMessage{}, fmt.Errorf("channelID is required")
	}
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return sdkapi.ChannelMessage{}, fmt.Errorf("filename is required")
	}
	if r == nil {
		return sdkapi.ChannelMessage{}, fmt.Errorf("file reader is required")
	}

	ct := strings.TrimSpace(contentType)
	if ct == "" {
		ct = "application/octet-stream"
	}

	uploaded, err := uploadToChannel(ctx, httpClient, apiBase, userToken, channelID, filename, ct, r)
	if err != nil {
		return sdkapi.ChannelMessage{}, err
	}

	voiceContentType := strings.TrimSpace(uploaded.ContentType)
	if voiceContentType == "" {
		voiceContentType = ct
	}

	voice := map[string]any{
		"key":         uploaded.Key,
		"contentType": voiceContentType,
		"size":        uploaded.Size,
	}
	if opts.DurationMs > 0 {
		voice["durationMs"] = opts.DurationMs
	}

	reqBody := map[string]any{
		"type": "message/voice",
		"payload": map[string]any{
			"voice": voice,
		},
	}
	if strings.TrimSpace(opts.PlainText) != "" {
		reqBody["plain-text"] = strings.TrimSpace(opts.PlainText)
	}

	b, err := json.Marshal(reqBody)
	if err != nil {
		return sdkapi.ChannelMessage{}, err
	}

	u, err := url.Parse(apiBase + "/channels/" + url.PathEscape(channelID) + "/messages")
	if err != nil {
		return sdkapi.ChannelMessage{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(b))
	if err != nil {
		return sdkapi.ChannelMessage{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(userToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return sdkapi.ChannelMessage{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return sdkapi.ChannelMessage{}, &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var msg sdkapi.ChannelMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return sdkapi.ChannelMessage{}, err
	}
	for i := range msg.Attachments {
		msg.Attachments[i].ChannelID = msg.ChannelID
	}
	return msg, nil
}

func uploadToChannel(
	ctx context.Context,
	httpClient *http.Client,
	apiBase, userToken, channelID, filename, contentType string,
	r io.Reader,
) (uploadResponse, error) {
	target := apiBase + "/channels/" + url.PathEscape(channelID) + "/uploads"

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	writeErrCh := make(chan error, 1)
	go func() {
		defer close(writeErrCh)

		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
		h.Set("Content-Type", contentType)

		part, err := writer.CreatePart(h)
		if err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}
		if _, err := io.Copy(part, r); err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}
		if err := writer.Close(); err != nil {
			_ = pw.CloseWithError(err)
			writeErrCh <- err
			return
		}
		_ = pw.Close()
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, pr)
	if err != nil {
		_ = pw.CloseWithError(err)
		return uploadResponse{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	if strings.TrimSpace(userToken) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(userToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return uploadResponse{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err := waitWriteErr(ctx, writeErrCh); err != nil {
		return uploadResponse{}, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return uploadResponse{}, &sdkapi.HTTPStatusError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}

	var out uploadResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return uploadResponse{}, err
	}
	if strings.TrimSpace(out.Key) == "" {
		return uploadResponse{}, fmt.Errorf("upload response missing key")
	}
	return out, nil
}

func waitWriteErr(ctx context.Context, ch <-chan error) error {
	select {
	case err := <-ch:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
