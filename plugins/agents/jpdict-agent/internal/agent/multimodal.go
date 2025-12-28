package agent

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	openaigo "github.com/openai/openai-go/v3"

	"mew/plugins/sdk/mew"
)

type downloadFunc func(ctx context.Context, att mew.AttachmentRef, limit int64) ([]byte, error)

type buildUserContentOptions struct {
	DefaultTextPrompt     string
	DefaultImagePrompt    string
	MaxImageBytes         int64
	MaxTotalImageBytes    int64
	Download              downloadFunc
	KeepEmptyWhenNoImages bool
}

func (o buildUserContentOptions) withDefaults() buildUserContentOptions {
	if strings.TrimSpace(o.DefaultTextPrompt) == "" {
		o.DefaultTextPrompt = "请帮我处理这段内容。"
	}
	if strings.TrimSpace(o.DefaultImagePrompt) == "" {
		o.DefaultImagePrompt = "请识别图片中的文字，并给出释义与翻译（如适用）。"
	}
	if o.MaxImageBytes <= 0 {
		o.MaxImageBytes = 5 * 1024 * 1024
	}
	if o.MaxTotalImageBytes <= 0 {
		o.MaxTotalImageBytes = 12 * 1024 * 1024
	}
	return o
}

func buildUserMessageParam(ctx context.Context, text string, attachments []mew.AttachmentRef, opts buildUserContentOptions) (openaigo.ChatCompletionMessageParamUnion, error) {
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
			return openaigo.UserMessage(""), nil
		}
		if text == "" {
			text = opts.DefaultTextPrompt
		}
		return openaigo.UserMessage(text), nil
	}

	if text == "" {
		text = opts.DefaultImagePrompt
	}
	if opts.Download == nil {
		return openaigo.ChatCompletionMessageParamUnion{}, fmt.Errorf("download function is required when images exist")
	}

	total := int64(0)
	parts := make([]openaigo.ChatCompletionContentPartUnionParam, 0, 1+len(images))
	parts = append(parts, openaigo.TextContentPart(text))

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
		parts = append(parts, openaigo.ImageContentPart(openaigo.ChatCompletionContentPartImageImageURLParam{
			URL: dataURL,
		}))
	}

	return openaigo.UserMessage(parts), nil
}

