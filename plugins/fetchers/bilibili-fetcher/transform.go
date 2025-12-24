package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"mew/plugins/sdk"
)

type transformContext struct {
	ctx          context.Context
	phClient     *http.Client
	uploadClient *http.Client
	apiBase      string
	webhookURL   string
	logPrefix    string
}

func parseRichTextNodes(nodes []RichTextNode) string {
	var parts []string
	for _, node := range nodes {
		nodeText := node.Text
		if nodeText == "" {
			nodeText = node.OrigText
		}
		switch node.Type {
		case "RICH_TEXT_NODE_TYPE_TEXT":
			if nodeText != "" {
				parts = append(parts, nodeText)
			}
		case "RICH_TEXT_NODE_TYPE_EMOJI":
			// Bilibili sometimes omits the `emoji` object (especially for custom/emote variants)
			// but still keeps the placeholder token in `text`/`orig_text`.
			if node.Emoji != nil && node.Emoji.Text != "" {
				parts = append(parts, node.Emoji.Text) // Keep it simple, just use the text tag
			} else if nodeText != "" {
				parts = append(parts, nodeText)
			}
		default:
			if nodeText != "" {
				parts = append(parts, nodeText)
			}
		}
	}
	return strings.Join(parts, "")
}

func richTextToString(v *RichText) string {
	if v == nil {
		return ""
	}
	if s := parseRichTextNodes(v.RichTextNodes); s != "" {
		return s
	}
	return v.Text
}

func normalizeBiliURL(raw string) string {
	u := strings.TrimSpace(raw)
	if u == "" {
		return ""
	}
	if strings.HasPrefix(u, "//") {
		return "https:" + u
	}
	if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		return u
	}
	return u
}

func drawItemsToPictures(draw *Draw) []Picture {
	if draw == nil {
		return nil
	}

	items := draw.Items
	if len(items) == 0 {
		items = draw.Pictures
	}

	out := make([]Picture, 0, len(items))
	for _, it := range items {
		u := strings.TrimSpace(string(it.URL))
		if u == "" {
			u = strings.TrimSpace(string(it.Src))
		}
		if u == "" {
			u = strings.TrimSpace(string(it.ImgSrc))
		}
		u = normalizeBiliURL(u)
		if u == "" {
			continue
		}
		out = append(out, Picture{URL: u})
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func majorDescString(major *Major) string {
	if major == nil {
		return ""
	}
	switch major.Type {
	case "MAJOR_TYPE_ARCHIVE":
		if major.Archive == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Archive.Desc))
	case "MAJOR_TYPE_OPUS":
		if major.Opus == nil {
			return ""
		}
		return strings.TrimSpace(richTextToString(&major.Opus.Summary))
	case "MAJOR_TYPE_DRAW":
		// Legacy image/text post structure. Some bilibili clients still return this
		// instead of MAJOR_TYPE_OPUS.
		if major.Draw != nil {
			if s := strings.TrimSpace(string(major.Draw.Description)); s != "" {
				return s
			}
		}
		if major.Opus != nil {
			return strings.TrimSpace(richTextToString(&major.Opus.Summary))
		}
		return ""
	case "MAJOR_TYPE_COMMON":
		if major.Common == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Common.Desc))
	case "MAJOR_TYPE_PGC":
		if major.PGC == nil {
			return ""
		}
		return strings.TrimSpace(string(major.PGC.Desc))
	case "MAJOR_TYPE_MUSIC":
		if major.Music == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Music.Intro))
	case "MAJOR_TYPE_LIVE":
		if major.Live == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Live.Desc))
	case "MAJOR_TYPE_MEDIALIST":
		if major.Medialist == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Medialist.Desc))
	case "MAJOR_TYPE_UGC_SEASON":
		if major.UGCSeason == nil {
			return ""
		}
		return strings.TrimSpace(string(major.UGCSeason.Desc))
	case "MAJOR_TYPE_COURSES":
		if major.Courses == nil {
			return ""
		}
		return strings.TrimSpace(string(major.Courses.Desc))
	default:
		return ""
	}
}

func pickDynamicText(dyn ModuleDynamic) string {
	if s := strings.TrimSpace(richTextToString(dyn.Desc)); s != "" {
		return s
	}
	if s := majorDescString(dyn.Major); s != "" {
		return s
	}
	return ""
}

func uploadRemoteToWebhook(tCtx transformContext, remoteURL, fallbackFilename string) (sdk.WebhookAttachment, error) {
	return sdk.UploadRemoteToWebhook(
		tCtx.ctx,
		tCtx.phClient,
		tCtx.uploadClient,
		tCtx.apiBase,
		tCtx.webhookURL,
		remoteURL,
		fallbackFilename,
		biliUserAgent, // keep fixed UA for bilibili domains
	)
}

func uploadCoverToWebhook(tCtx transformContext, coverURL string) string {
	u := normalizeBiliURL(coverURL)
	if u == "" {
		return ""
	}
	att, err := uploadRemoteToWebhook(tCtx, u, "cover.jpg")
	if err != nil {
		log.Printf("%s upload cover failed: %v", tCtx.logPrefix, err)
		return ""
	}
	return att.Key
}

type localizedEmoji struct {
	Text      string `json:"text"`
	IconURL   string `json:"icon_url"`
	S3IconURL string `json:"s3_icon_url,omitempty"`
}

func collectEmojiNodes(v *RichText) []localizedEmoji {
	if v == nil || len(v.RichTextNodes) == 0 {
		return nil
	}
	out := make([]localizedEmoji, 0, len(v.RichTextNodes))
	for _, node := range v.RichTextNodes {
		if node.Type != "RICH_TEXT_NODE_TYPE_EMOJI" || node.Emoji == nil {
			continue
		}
		icon := strings.TrimSpace(node.Emoji.IconURL)
		if icon == "" {
			continue
		}
		out = append(out, localizedEmoji{
			Text:    node.Emoji.Text,
			IconURL: icon,
		})
	}
	return out
}

func localizeEmojisToWebhook(tCtx transformContext, richTexts ...*RichText) []localizedEmoji {
	seen := map[string]bool{}
	var emojis []localizedEmoji
	for _, rt := range richTexts {
		for _, e := range collectEmojiNodes(rt) {
			if seen[e.IconURL] {
				continue
			}
			seen[e.IconURL] = true

			att, err := uploadRemoteToWebhook(tCtx, e.IconURL, "emoji.png")
			if err != nil {
				log.Printf("%s upload emoji failed: %v", tCtx.logPrefix, err)
				emojis = append(emojis, e)
				continue
			}
			e.S3IconURL = att.Key
			emojis = append(emojis, e)
		}
	}
	if len(emojis) == 0 {
		return nil
	}
	return emojis
}

func majorTitleAndURL(major *Major) (string, string) {
	if major == nil {
		return "", ""
	}
	switch major.Type {
	case "MAJOR_TYPE_ARCHIVE":
		if major.Archive == nil {
			return "", ""
		}
		return string(major.Archive.Title), normalizeBiliURL(string(major.Archive.JumpURL))
	case "MAJOR_TYPE_OPUS":
		if major.Opus == nil {
			return "", ""
		}
		return string(major.Opus.Title), normalizeBiliURL(string(major.Opus.JumpURL))
	case "MAJOR_TYPE_DRAW":
		// Prefer opus fields if present; otherwise fall back to the legacy draw card.
		if major.Opus != nil {
			return string(major.Opus.Title), normalizeBiliURL(string(major.Opus.JumpURL))
		}
		if major.Draw != nil {
			return string(major.Draw.Title), normalizeBiliURL(string(major.Draw.JumpURL))
		}
		return "", ""
	case "MAJOR_TYPE_COMMON":
		if major.Common == nil {
			return "", ""
		}
		return string(major.Common.Title), normalizeBiliURL(string(major.Common.JumpURL))
	case "MAJOR_TYPE_PGC":
		if major.PGC == nil {
			return "", ""
		}
		return string(major.PGC.Title), normalizeBiliURL(string(major.PGC.JumpURL))
	case "MAJOR_TYPE_MUSIC":
		if major.Music == nil {
			return "", ""
		}
		return string(major.Music.Title), normalizeBiliURL(string(major.Music.JumpURL))
	case "MAJOR_TYPE_LIVE":
		if major.Live == nil {
			return "", ""
		}
		return string(major.Live.Title), normalizeBiliURL(string(major.Live.JumpURL))
	case "MAJOR_TYPE_MEDIALIST":
		if major.Medialist == nil {
			return "", ""
		}
		return string(major.Medialist.Title), normalizeBiliURL(string(major.Medialist.JumpURL))
	case "MAJOR_TYPE_UGC_SEASON":
		if major.UGCSeason == nil {
			return "", ""
		}
		return string(major.UGCSeason.Title), normalizeBiliURL(string(major.UGCSeason.JumpURL))
	case "MAJOR_TYPE_COURSES":
		if major.Courses == nil {
			return "", ""
		}
		return string(major.Courses.Title), normalizeBiliURL(string(major.Courses.JumpURL))
	default:
		return "", ""
	}
}

func transformItemToWebhook(tCtx transformContext, item APIItem) (*sdk.WebhookPayload, error) {
	author := item.Modules.ModuleAuthor
	dyn := item.Modules.ModuleDynamic

	payload := map[string]any{
		"dynamic_id":        item.IDStr,
		"dynamic_url":       fmt.Sprintf("https://t.bilibili.com/%s", item.IDStr),
		"author_name":       author.Name,
		"author_face":       author.Face,
		"author_mid":        author.ID,
		"author_type":       author.Type,
		"published_at":      int64(author.PubTS),
		"published_loc":     author.PubLoc,
		"bili_dynamic_type": item.Type,
	}
	if dyn.Major != nil {
		payload["bili_major_type"] = dyn.Major.Type
	}
	if dyn.Additional != nil {
		payload["additional"] = dyn.Additional
	}

	var contentParts []string
	var emojis []localizedEmoji

	switch item.Type {
	case "DYNAMIC_TYPE_AV": // Video
		if dyn.Major == nil || dyn.Major.Archive == nil {
			return nil, fmt.Errorf("missing archive for type=%s", item.Type)
		}
		video := dyn.Major.Archive
		title := fmt.Sprintf("%s 发布了新视频", author.Name)

		descText := strings.TrimSpace(richTextToString(dyn.Desc))
		// Some feeds omit module_dynamic.desc; fall back to the archive's description.
		if descText == "" && strings.TrimSpace(string(video.Desc)) != "" {
			descText = strings.TrimSpace(string(video.Desc))
		}
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)

		contentParts = append(contentParts, fmt.Sprintf("%s：%s", title, string(video.Title)))
		if descText != "" {
			contentParts = append(contentParts, descText)
		}

		payload["type"] = "video"
		payload["title"] = string(video.Title)
		payload["description"] = descText
		payload["bvid"] = video.BVID
		payload["cover_url"] = normalizeBiliURL(string(video.Cover))
		if u := normalizeBiliURL(string(video.JumpURL)); u != "" {
			payload["video_url"] = u
		} else if video.BVID != "" {
			payload["video_url"] = "https://www.bilibili.com/video/" + video.BVID
		}

	case "DYNAMIC_TYPE_ARTICLE": // Article (often MAJOR_TYPE_OPUS)
		if dyn.Major == nil || dyn.Major.Opus == nil {
			return nil, fmt.Errorf("missing opus for type=%s", item.Type)
		}
		opus := dyn.Major.Opus
		title := fmt.Sprintf("%s 发布了新文章", author.Name)
		summary := richTextToString(&opus.Summary)
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc, &opus.Summary)

		contentParts = append(contentParts, fmt.Sprintf("%s: %s", title, string(opus.Title)))
		if summary != "" {
			contentParts = append(contentParts, summary)
		}

		payload["type"] = "article"
		payload["title"] = string(opus.Title)
		payload["summary"] = summary
		payload["article_url"] = normalizeBiliURL(string(opus.JumpURL))
		origImages, s3Images := uploadPictures(tCtx, opus.Pics)
		if len(origImages) > 0 {
			payload["image_urls"] = origImages
		}
		if len(s3Images) > 0 {
			payload["s3_image_urls"] = s3Images
		}

	case "DYNAMIC_TYPE_DRAW", "DYNAMIC_TYPE_WORD": // Image/Text or Pure Text
		pics := []Picture{}
		if dyn.Major != nil {
			if dyn.Major.Opus != nil {
				pics = dyn.Major.Opus.Pics
				emojis = localizeEmojisToWebhook(tCtx, dyn.Desc, &dyn.Major.Opus.Summary)
			} else if dyn.Major.Draw != nil {
				pics = drawItemsToPictures(dyn.Major.Draw)
				emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
			} else {
				emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
			}
		} else {
			emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		}

		text := pickDynamicText(dyn)

		if text == "" {
			text = fmt.Sprintf("%s 发布了一条动态", author.Name)
		}
		contentParts = append(contentParts, text)

		payload["type"] = "post"
		payload["text"] = text
		origImages, s3Images := uploadPictures(tCtx, pics)
		if len(origImages) > 0 {
			payload["image_urls"] = origImages
		}
		if len(s3Images) > 0 {
			payload["s3_image_urls"] = s3Images
		}

	case "DYNAMIC_TYPE_PGC": // PGC episode update
		if dyn.Major == nil || dyn.Major.PGC == nil {
			return nil, fmt.Errorf("missing pgc for type=%s", item.Type)
		}
		pgc := dyn.Major.PGC
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 更新了剧集：%s", author.Name, string(pgc.Title)))
		if string(pgc.SubTitle) != "" {
			contentParts = append(contentParts, string(pgc.SubTitle))
		}
		if string(pgc.Desc) != "" {
			contentParts = append(contentParts, string(pgc.Desc))
		}
		payload["type"] = "pgc"
		payload["title"] = string(pgc.Title)
		payload["subtitle"] = string(pgc.SubTitle)
		payload["description"] = string(pgc.Desc)
		payload["season_id"] = string(pgc.SeasonID)
		payload["ep_id"] = string(pgc.EpisodeID)
		payload["cover_url"] = normalizeBiliURL(string(pgc.Cover))
		payload["pgc_url"] = normalizeBiliURL(string(pgc.JumpURL))

	case "DYNAMIC_TYPE_MUSIC": // audio
		if dyn.Major == nil || dyn.Major.Music == nil {
			return nil, fmt.Errorf("missing music for type=%s", item.Type)
		}
		m := dyn.Major.Music
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 发布了音频：%s", author.Name, string(m.Title)))
		if string(m.Intro) != "" {
			contentParts = append(contentParts, string(m.Intro))
		}
		payload["type"] = "music"
		payload["title"] = string(m.Title)
		payload["description"] = string(m.Intro)
		payload["music_id"] = string(m.ID)
		payload["author"] = string(m.Author)
		payload["cover_url"] = normalizeBiliURL(string(m.Cover))
		if u := normalizeBiliURL(string(m.JumpURL)); u != "" {
			payload["music_url"] = u
		} else {
			payload["music_url"] = string(m.Schema)
		}

	case "DYNAMIC_TYPE_COMMON_SQUARE", "DYNAMIC_TYPE_COMMON_VERTICAL":
		if dyn.Major == nil || dyn.Major.Common == nil {
			return nil, fmt.Errorf("missing common for type=%s", item.Type)
		}
		c := dyn.Major.Common
		descText := richTextToString(dyn.Desc)
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		if descText == "" {
			descText = strings.TrimSpace(string(c.Desc))
		}
		if string(c.Title) != "" {
			contentParts = append(contentParts, fmt.Sprintf("%s 分享：%s", author.Name, string(c.Title)))
		} else if descText != "" {
			contentParts = append(contentParts, fmt.Sprintf("%s 分享了一条内容", author.Name))
		}
		if descText != "" {
			contentParts = append(contentParts, descText)
		}
		payload["type"] = "common"
		payload["title"] = string(c.Title)
		payload["description"] = descText
		payload["cover_url"] = normalizeBiliURL(string(c.Cover))
		payload["url"] = normalizeBiliURL(string(c.JumpURL))

	case "DYNAMIC_TYPE_LIVE": // live room share
		if dyn.Major == nil || dyn.Major.Live == nil {
			return nil, fmt.Errorf("missing live for type=%s", item.Type)
		}
		l := dyn.Major.Live
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 分享了直播间：%s", author.Name, string(l.Title)))
		if string(l.Desc) != "" {
			contentParts = append(contentParts, string(l.Desc))
		}
		payload["type"] = "live_share"
		payload["title"] = string(l.Title)
		payload["description"] = string(l.Desc)
		payload["room_id"] = string(l.RoomID)
		payload["cover_url"] = normalizeBiliURL(string(l.Cover))
		payload["live_url"] = normalizeBiliURL(string(l.JumpURL))

	case "DYNAMIC_TYPE_MEDIALIST": // favorite list
		if dyn.Major == nil || dyn.Major.Medialist == nil {
			return nil, fmt.Errorf("missing medialist for type=%s", item.Type)
		}
		ml := dyn.Major.Medialist
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 分享了收藏夹：%s", author.Name, string(ml.Title)))
		if string(ml.Desc) != "" {
			contentParts = append(contentParts, string(ml.Desc))
		}
		payload["type"] = "medialist"
		payload["title"] = string(ml.Title)
		payload["description"] = string(ml.Desc)
		payload["medialist_id"] = string(ml.ID)
		payload["cover_url"] = normalizeBiliURL(string(ml.Cover))
		payload["url"] = normalizeBiliURL(string(ml.JumpURL))

	case "DYNAMIC_TYPE_UGC_SEASON": // series/collection update
		if dyn.Major == nil || dyn.Major.UGCSeason == nil {
			return nil, fmt.Errorf("missing ugc_season for type=%s", item.Type)
		}
		s := dyn.Major.UGCSeason
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 更新了合集：%s", author.Name, string(s.Title)))
		if string(s.Desc) != "" {
			contentParts = append(contentParts, string(s.Desc))
		}
		payload["type"] = "ugc_season"
		payload["title"] = string(s.Title)
		payload["description"] = string(s.Desc)
		payload["season_id"] = string(s.SeasonID)
		payload["cover_url"] = normalizeBiliURL(string(s.Cover))
		payload["url"] = normalizeBiliURL(string(s.JumpURL))

	case "DYNAMIC_TYPE_COURSES", "DYNAMIC_TYPE_COURSES_SEASON", "DYNAMIC_TYPE_COURSES_BATCH":
		if dyn.Major == nil || dyn.Major.Courses == nil {
			return nil, fmt.Errorf("missing courses for type=%s", item.Type)
		}
		c := dyn.Major.Courses
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		contentParts = append(contentParts, fmt.Sprintf("%s 分享了课程：%s", author.Name, string(c.Title)))
		if string(c.Desc) != "" {
			contentParts = append(contentParts, string(c.Desc))
		}
		payload["type"] = "courses"
		payload["title"] = string(c.Title)
		payload["description"] = string(c.Desc)
		payload["course_id"] = string(c.ID)
		payload["cover_url"] = normalizeBiliURL(string(c.Cover))
		payload["url"] = normalizeBiliURL(string(c.JumpURL))

	case "DYNAMIC_TYPE_FORWARD": // Forward
		text := strings.TrimSpace(richTextToString(dyn.Desc))
		emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
		if text == "" {
			if s := majorDescString(dyn.Major); s != "" {
				text = fmt.Sprintf("%s：%s", author.Name, s)
			}
		}
		if text == "" {
			if t, u := majorTitleAndURL(dyn.Major); t != "" && u != "" {
				text = fmt.Sprintf("%s 转发：%s %s", author.Name, t, u)
			} else {
				text = fmt.Sprintf("%s 转发了一条动态", author.Name)
			}
		}
		contentParts = append(contentParts, text)

		payload["type"] = "forward"
		payload["text"] = text

		if item.Orig != nil {
			origPayload, err := transformItemToWebhook(tCtx, *item.Orig)
			if err != nil {
				log.Printf("%s failed to transform original post: %v", tCtx.logPrefix, err)
			} else {
				payload["original_post"] = origPayload.Payload
				payload["original_author"] = origPayload.Username
				// Add original content to the main message for text-only clients
				contentParts = append(contentParts, fmt.Sprintf("\n// @%s: %s", origPayload.Username, origPayload.Content))
			}
		}

	case "DYNAMIC_TYPE_LIVE_RCMD": // Live
		if dyn.Major == nil || dyn.Major.LiveRcmd == nil {
			return nil, fmt.Errorf("missing live_rcmd for type=%s", item.Type)
		}
		var liveData LiveContent
		if err := json.Unmarshal([]byte(dyn.Major.LiveRcmd.Content), &liveData); err == nil {
			info := liveData.LivePlayInfo
			title := fmt.Sprintf("%s 正在直播: %s", author.Name, info.Title)
			contentParts = append(contentParts, title)
			payload["type"] = "live"
			payload["title"] = info.Title
			payload["room_id"] = info.RoomID
			payload["cover_url"] = normalizeBiliURL(info.Cover)
			payload["live_url"] = normalizeBiliURL(info.Link)
		} else {
			return nil, fmt.Errorf("unsupported live content: %w", err)
		}

	default:
		// Best-effort fallback: many types still provide a usable major card.
		if t, u := majorTitleAndURL(dyn.Major); t != "" || u != "" {
			content := pickDynamicText(dyn)
			emojis = localizeEmojisToWebhook(tCtx, dyn.Desc)
			if content != "" {
				contentParts = append(contentParts, content)
			} else if t != "" && u != "" {
				contentParts = append(contentParts, fmt.Sprintf("%s：%s\n%s", author.Name, t, u))
			} else if t != "" {
				contentParts = append(contentParts, fmt.Sprintf("%s：%s", author.Name, t))
			} else {
				contentParts = append(contentParts, fmt.Sprintf("%s 发布了一条动态", author.Name))
			}
			if u != "" && !strings.Contains(contentParts[len(contentParts)-1], u) {
				contentParts = append(contentParts, u)
			}
			payload["type"] = "unknown"
			payload["title"] = t
			payload["url"] = u
			break
		}
		return nil, fmt.Errorf("unsupported dynamic type: %s", item.Type)
	}

	if coverURL, ok := payload["cover_url"].(string); ok && strings.TrimSpace(coverURL) != "" {
		if key := uploadCoverToWebhook(tCtx, coverURL); key != "" {
			payload["s3_cover_url"] = key
		}
	}
	if len(emojis) > 0 {
		payload["emojis"] = emojis
	}

	msg := &sdk.WebhookPayload{
		Content:   strings.Join(contentParts, "\n"),
		Type:      "app/x-bilibili-card",
		Payload:   payload,
		Username:  author.Name,
		AvatarURL: author.Face, // Fallback for clients that don't use the s3 key
	}

	return msg, nil
}

func uploadPictures(tCtx transformContext, pics []Picture) (origURLs []string, s3Keys []string) {
	if len(pics) == 0 {
		return nil, nil
	}
	for _, pic := range pics {
		if pic.URL == "" {
			continue
		}
		origURLs = append(origURLs, pic.URL)
		att, err := uploadRemoteToWebhook(tCtx, pic.URL, "image.jpg")
		if err != nil {
			log.Printf("%s upload image failed: %v", tCtx.logPrefix, err)
			continue
		}
		s3Keys = append(s3Keys, att.Key)
	}
	return origURLs, s3Keys
}
