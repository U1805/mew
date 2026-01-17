package llm

import (
	"encoding/json"
	"strings"

	sdkapi "mew/plugins/pkg/api"
)

type messageStickerPayload struct {
	Sticker *struct {
		URL         string `json:"url"`
		ContentType string `json:"contentType"`
		Size        int64  `json:"size"`
		Key         string `json:"key"`
		Name        string `json:"name"`
	} `json:"sticker"`
}

// StickerAttachmentsFromPayload converts a message payload's `sticker` object into image attachments
// so the LLM can "see" sticker messages as images.
func StickerAttachmentsFromPayload(channelID string, payload json.RawMessage) []sdkapi.AttachmentRef {
	payload = json.RawMessage(strings.TrimSpace(string(payload)))
	if len(payload) == 0 {
		return nil
	}

	var p messageStickerPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil
	}
	if p.Sticker == nil {
		return nil
	}

	url := strings.TrimSpace(p.Sticker.URL)
	key := strings.TrimSpace(p.Sticker.Key)
	ct := strings.TrimSpace(p.Sticker.ContentType)

	// Need at least one fetchable locator.
	if url == "" && key == "" {
		return nil
	}
	if ct == "" {
		ct = "image/png"
	}
	if !strings.HasPrefix(strings.ToLower(ct), "image/") {
		return nil
	}

	filename := strings.TrimSpace(p.Sticker.Name)
	if filename == "" {
		filename = "sticker"
	}
	return []sdkapi.AttachmentRef{
		{
			ChannelID:   strings.TrimSpace(channelID),
			Filename:    filename,
			ContentType: ct,
			Key:         key,
			Size:        p.Sticker.Size,
			URL:         url,
		},
	}
}
