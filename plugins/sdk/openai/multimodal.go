package openai

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"mew/plugins/sdk/mew"
)

type ContentPart struct {
	Type     string           `json:"type"`
	Text     string           `json:"text,omitempty"`
	ImageURL *ImageURLPayload `json:"image_url,omitempty"`
}

type ImageURLPayload struct {
	URL string `json:"url"`
}

type DownloadFunc func(ctx context.Context, att mew.AttachmentRef, limit int64) ([]byte, error)

type BuildUserContentOptions struct {
	DefaultTextPrompt     string
	DefaultImagePrompt    string
	MaxImageBytes         int64
	MaxTotalImageBytes    int64
	Download              DownloadFunc
	KeepEmptyWhenNoImages bool
}

func (o BuildUserContentOptions) withDefaults() BuildUserContentOptions {
	if strings.TrimSpace(o.DefaultTextPrompt) == "" {
		o.DefaultTextPrompt = "请帮我处理这段内容。"
	}
	if strings.TrimSpace(o.DefaultImagePrompt) == "" {
		o.DefaultImagePrompt = "请识别图片中的内容，并结合上下文回复。"
	}
	if o.MaxImageBytes <= 0 {
		o.MaxImageBytes = 5 * 1024 * 1024
	}
	if o.MaxTotalImageBytes <= 0 {
		o.MaxTotalImageBytes = 12 * 1024 * 1024
	}
	return o
}

func BuildUserContentParts(ctx context.Context, text string, attachments []mew.AttachmentRef, opts BuildUserContentOptions) (any, error) {
	opts = opts.withDefaults()
	text = strings.TrimSpace(text)

	images := make([]mew.AttachmentRef, 0, len(attachments))
	for _, a := range attachments {
		ct := strings.ToLower(strings.TrimSpace(a.ContentType))
		if !strings.HasPrefix(ct, "image/") {
			continue
		}
		if strings.TrimSpace(a.URL) == "" && strings.TrimSpace(a.Key) == "" {
			continue
		}
		images = append(images, a)
	}

	if len(images) == 0 {
		if text == "" && opts.KeepEmptyWhenNoImages {
			return "", nil
		}
		if text == "" {
			text = opts.DefaultTextPrompt
		}
		return text, nil
	}
	if text == "" {
		text = opts.DefaultImagePrompt
	}
	if opts.Download == nil {
		return nil, fmt.Errorf("download function is required when images exist")
	}

	total := int64(0)
	parts := make([]ContentPart, 0, 1+len(images))
	parts = append(parts, ContentPart{Type: "text", Text: text})

	for _, img := range images {
		if img.Size > 0 && img.Size > opts.MaxImageBytes {
			continue
		}
		if total > opts.MaxTotalImageBytes {
			break
		}

		data, err := opts.Download(ctx, img, opts.MaxImageBytes)
		if err != nil {
			continue
		}
		total += int64(len(data))
		if total > opts.MaxTotalImageBytes {
			break
		}

		mime := strings.TrimSpace(img.ContentType)
		if mime == "" {
			mime = "image/png"
		}
		dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
		parts = append(parts, ContentPart{
			Type: "image_url",
			ImageURL: &ImageURLPayload{
				URL: dataURL,
			},
		})
	}

	return parts, nil
}
