package llm

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	openaigo "github.com/openai/openai-go/v3"

	sdkapi "mew/plugins/sdk/api"
)

type DownloadFunc func(ctx context.Context, att sdkapi.AttachmentRef, limit int64) ([]byte, error)

type SpeakerMetaFunc func(username, userID string, sentAt time.Time) string

type BuildUserContentOptions struct {
	DefaultTextPrompt     string
	DefaultImagePrompt    string
	MaxImageBytes         int64
	MaxTotalImageBytes    int64
	Download              DownloadFunc
	KeepEmptyWhenNoImages bool
	SpeakerMeta           SpeakerMetaFunc
}

func (o BuildUserContentOptions) withDefaults() BuildUserContentOptions {
	if strings.TrimSpace(o.DefaultTextPrompt) == "" {
		o.DefaultTextPrompt = defaultTextPrompt
	}
	if strings.TrimSpace(o.DefaultImagePrompt) == "" {
		o.DefaultImagePrompt = defaultImagePrompt
	}
	if o.MaxImageBytes <= 0 {
		o.MaxImageBytes = defaultMaxImageBytes
	}
	if o.MaxTotalImageBytes <= 0 {
		o.MaxTotalImageBytes = defaultMaxTotalImageBytes
	}
	return o
}

func BuildUserMessageParam(ctx context.Context, speakerUsername, speakerUserID string, sentAt time.Time, text string, attachments []sdkapi.AttachmentRef, opts BuildUserContentOptions) (openaigo.ChatCompletionMessageParamUnion, error) {
	opts = opts.withDefaults()
	text = strings.TrimSpace(text)
	meta := ""
	if opts.SpeakerMeta != nil {
		meta = strings.TrimSpace(opts.SpeakerMeta(speakerUsername, speakerUserID, sentAt))
	}

	images := make([]sdkapi.AttachmentRef, 0, len(attachments))
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
		if meta != "" {
			return openaigo.UserMessage(meta + "\n" + text), nil
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
	if meta != "" {
		parts = append(parts, openaigo.TextContentPart(meta+"\n"+text))
	} else {
		parts = append(parts, openaigo.TextContentPart(text))
	}

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

		mime := strings.TrimSpace(img.ContentType)
		if mime == "" {
			mime = "image/png"
		}

		if webpData, err := compressImageToWebP(data, 720); err == nil && len(webpData) > 0 {
			data = webpData
			mime = "image/webp"
		}
		if int64(len(data)) > opts.MaxImageBytes {
			continue
		}

		total += int64(len(data))
		if total > opts.MaxTotalImageBytes {
			break
		}

		dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
		parts = append(parts, openaigo.ImageContentPart(openaigo.ChatCompletionContentPartImageImageURLParam{
			URL: dataURL,
		}))
	}

	return openaigo.UserMessage(parts), nil
}
