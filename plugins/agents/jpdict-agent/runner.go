package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"mew/plugins/sdk"
	"mew/plugins/sdk/httpx"
)

const jpdictCardMessageType = "app/x-jpdict-card"

// NOTE: Go raw string literals cannot contain backticks (`), so we keep this as
// an interpreted string with explicit \n newlines.
const jpdictSystemPrompt = "### 日语全能学习助手 (Japanese Learning Navigator)\n\n#### 角色设定\n你是我的专属日语学习伙伴，精通日语语言学、词源学和教学法。你的核心任务是提供深度、精准的查词和翻译解析服务，帮助我（默认中文母语，日语水平N3）攻克学习难点。你必须严格遵循预设的格式进行输出。\n\n#### 核心运行逻辑\n\n1.  输入识别: 首先判断输入是图片还是文本。\n    *   图片输入: 对图片执行高精度文字识别（OCR），将识别出的文本作为后续处理的原始输入。\n    *   文本输入: 直接使用用户输入的文本。\n\n2.  模式判断: 根据识别出的文本内容，决定进入何种模式。\n    *   日语词典模式: 输入为单个日文单词（判断标准：无空格、无标点，完全由汉字、平假名、片假名组成）。\n    *   翻译解析模式: 输入为句子、短语、包含中文、或任何不符合“单个日文单词”标准的文本。\n    *   异常处理: 若输入为空、无法识别或为无意义符号，则礼貌提示：“请输入有效的学习内容。”\n\n---\n\n### 模式一：日语词典模式输出格式\n\n<p><ruby>単語<rp>(</rp><rt>たんご</rt><rp>)</rp></ruby></p>\n\n【词性】\n- 名词：中文释义1\n- する动词：中文释义2\n- (根据实际词性，一行一个)\n\n💡 核心释义\n释义1: [该词性的核心中文释义]\n- 本质理解: [用自然流畅的中文，深入解析该词的语言学内核、语感和适用场景。例如，拆解汉字构成、解释其比喻义或引申义，点明与其他词的细微差别。]\n- <p>例句: <ruby>ここに<rp>(</rp><rt>ここに</rt><rp>)</rp></ruby>サインをお<ruby>願<rp>(</rp><rt>ねが</rt><rp>)</rp></ruby>いします。</p>\n- 译文: [例句的中文翻译]\n\n(如有第二个重要释义，按此格式补充)\n释义2: [...]\n- 本质理解: [...]\n- 例句: [...]\n- 译文: [...]\n\n🔄 活用变化\n[根据单词词性显示相关变化，若无则省略此部分]\n- 动词活用: [展示主要动词形态，如：ます形、て形、た形、ない形、意志形、可能形、被动形、使役形等]\n- い形容词: [展示：く/かった/くない/くなかった]\n- な形容词: [展示：に/で/だった/じゃない]\n\n🔗 词汇拓展\n[根据单词情况，选择性展示1-3项最有价值的内容]\n- 常用搭配: [2-4个高频搭配，如：<ruby>言葉<rp>(</rp><rt>ことば</rt><rp>)</rp></ruby>を<ruby>交<rp>(</rp><rt>か</rt><rp>)</rp></ruby>わす]\n- 汉字分解: [对单词中的核心汉字进行音读、训读说明，并关联其他常用词，帮助联想记忆]\n- 派生词: [2-3个相关派生词，如：<ruby>開発<rp>(</rp><rt>かいはつ</rt><rp>)</rp></ruby> → <ruby>開発者<rp>(</rp><rt>かいはつしゃ</rt><rp>)</rp></ruby>]\n- 近义/反义: [各1-2个最贴切的近义词或反义词]\n- 易混淆词: [辨析1-2个形近、意近但用法不同的词汇]\n\n🧠 记忆方法\n[提供一两句精炼、高效的记忆技巧，可结合汉字、谐音、语境或文化背景]\n\n⚠️ 注意事项\n> [指出该词的特殊用法、常见错误、敬语/谦语别、口语/书面语差异等关键要点]\n\n---\n\n### 模式二：翻译解析模式输出格式\n\n<p>原文： <ruby>{{用户的原始输入内容，保持原样, 对汉字注音}}</ruby></p>\n\n译文： {{对应翻译结果，确保准确、自然、地道}}\n\n---\n📚 难点解析 (面向N3水平)\n\n[智能识别原文中的1-3个核心难点（如N2/N1级别的词汇、关键的N3语法点、固定搭配或俗语），并逐一进行深度解析。]\n\n1. <p><ruby>解析点一<rp>(</rp><rt>かいせきてんいち</rt><rp>)</rp></ruby></p>\n\n- 【类型】: [例如：N2副词 / N3语法「〜わけだ」/ 惯用句]\n- 【释义与用法】: [详细解释该词汇或语法的核心含义、接续规则和使用场景。解释应深入浅出，符合N3学习者的认知习惯，点明为何在此句中使用。]\n- <p>【补充例句】: このレストランはいつも<ruby>込<rp>(</rp><rt>こ</rt><rp>)</rp></ruby>んでいる。なるほど、おいしい<ruby>わけだ<rp>(</rp><rt>わけだ</rt><rp>)</rp></ruby>。</p>\n- 【译文】: 这家餐厅总是人满为患。怪不得，原来是很好吃啊。\n\n2. <p><ruby>解析点二<rp>(</rp><rt>かいせきてんに</rt><rp>)</rp></ruby></p>\n\n- 【类型】: [...]\n- 【释义与用法】: [...]\n- <p>【补充例句】: [...](如有注音则用 <p> 包裹)</p>\n- 【译文】: [...]\n\n---\n\n### 全局格式化规则\n\n1.  注音规则: 所有日语汉字读音必须使用HTML的`<ruby>`标签进行标注。格式为：`<ruby>汉字<rp>(</rp><rt>假名</rt><rp>)</rp></ruby>`。纯假名单词无需注音。\n2.  段落规则: 任何包含了`<ruby>`标签的独立段落（如例句、解析标题等），都必须用`<p>...</p>`标签将其完整包裹。如果一个段落中没有任何注音，则不需要使用`<p>`标签。\n\n### 核心原则\n- 格式至上: 严格遵守上述两种模式的输出结构和全局格式化规则。\n- 用户中心: 所有解释均面向“中文母语、N3水平”的用户，避免过于简单或过于高深, 在重点知识点处使用 markdown **加粗标记** 或者 html <b>加粗标记</b> (根据该知识点是否处在 <p> 标签内判断使用哪个)。\n- 深度优先: 无论是词典还是解析，都追求对语言现象的本质理解，而不仅仅是表面翻译。\n- 实用导向: 聚焦于高频用法、核心难点和常见错误，直接服务于学习和应用。\n- 精准对应: 翻译要信、达、雅；解析要一针见血。\n\n现在，请根据我的输入，自动判断并执行相应模式。\n"

type JpdictConfig struct {
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
	Model        string `json:"model"`
}

type JpdictRunner struct {
	serviceType string

	botID       string
	botName     string
	accessToken string // bot access token from bootstrap (not a JWT)
	userToken   string // JWT issued by /api/auth/bot

	apiBase string
	mewURL  string
	wsURL   string

	mewHTTPClient *http.Client
	llmHTTPClient *http.Client

	botUserID string

	cfgMu sync.RWMutex
	cfg   JpdictConfig

	dmMu        sync.RWMutex
	dmChannelID map[string]struct{}
}

type outboundMessage struct {
	Type    string
	Content string
	Payload map[string]any
}

func NewJpdictRunner(serviceType, botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*JpdictRunner, error) {
	parsedCfg, err := parseJpdictConfig(rawConfig)
	if err != nil {
		return nil, err
	}

	mewURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MEW_URL")), "/")
	if mewURL == "" {
		mewURL = strings.TrimRight(strings.TrimSuffix(cfg.APIBase, "/api"), "/")
	}
	if mewURL == "" {
		mewURL = "http://localhost:3000"
	}

	wsURL, err := socketIOWebsocketURL(mewURL)
	if err != nil {
		return nil, err
	}

	mewHTTPClient, err := newMewUserHTTPClient()
	if err != nil {
		return nil, err
	}

	llmHTTPClient, err := newExternalHTTPClient()
	if err != nil {
		return nil, err
	}

	return &JpdictRunner{
		serviceType:   serviceType,
		botID:         botID,
		botName:       botName,
		accessToken:   accessToken,
		userToken:     "",
		apiBase:       strings.TrimRight(cfg.APIBase, "/"),
		mewURL:        mewURL,
		wsURL:         wsURL,
		mewHTTPClient: mewHTTPClient,
		llmHTTPClient: llmHTTPClient,
		botUserID:     "",
		cfg:           parsedCfg,
		dmChannelID:   map[string]struct{}{},
		cfgMu:         sync.RWMutex{},
		dmMu:          sync.RWMutex{},
	}, nil
}

func (r *JpdictRunner) Run(ctx context.Context) error {
	logPrefix := fmt.Sprintf("[jpdict-agent] bot=%s name=%q", r.botID, r.botName)

	me, token, err := r.loginBot(ctx)
	if err != nil {
		return fmt.Errorf("%s bot auth failed: %w", logPrefix, err)
	}
	r.botUserID = me.ID
	r.userToken = token

	if err := r.refreshDMChannels(ctx); err != nil {
		log.Printf("%s refresh DM channels failed (will retry later): %v", logPrefix, err)
	}

	backoff := 500 * time.Millisecond
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		err := r.runSocketOnce(ctx, logPrefix)
		if ctx.Err() != nil {
			return ctx.Err()
		}

		log.Printf("%s gateway disconnected: %v (reconnecting in %s)", logPrefix, err, backoff)
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}

		if backoff < 10*time.Second {
			backoff *= 2
		}
	}
}

func (r *JpdictRunner) runSocketOnce(ctx context.Context, logPrefix string) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.Dial(r.wsURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	var writeMu sync.Mutex
	sendText := func(payload string) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteMessage(websocket.TextMessage, []byte(payload))
	}

	emit := func(event string, payload any) error {
		frame, err := json.Marshal([]any{event, payload})
		if err != nil {
			return err
		}
		return sendText("42" + string(frame))
	}

	stop := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "shutdown"), time.Now().Add(2*time.Second))
			_ = conn.Close()
		case <-stop:
		}
	}()
	defer close(stop)

	authed := false

	for {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return err
		}

		for _, frame := range splitSocketIOFrames(msg) {
			s := string(frame)
			if s == "" {
				continue
			}

			switch s[0] {
			case '0': // Engine.IO open
				authPayload, _ := json.Marshal(map[string]string{"token": r.userToken})
				if err := sendText("40" + string(authPayload)); err != nil {
					return err
				}
			case '1': // Engine.IO close
				return errors.New("engine.io close")
			case '2': // ping
				if err := sendText("3"); err != nil {
					return err
				}
			case '4': // message (Socket.IO)
				if len(s) >= 2 && s[1] == '0' {
					authed = true
					log.Printf("%s connected to gateway (mewURL=%s)", logPrefix, r.mewURL)
					continue
				}
				if len(s) >= 2 && s[1] == '4' {
					return fmt.Errorf("socket.io error: %s", strings.TrimSpace(s))
				}
				if strings.HasPrefix(s, "42") {
					if err := r.handleEvent(ctx, logPrefix, s[2:], emit); err != nil {
						log.Printf("%s event handler error: %v", logPrefix, err)
					}
				}
			default:
			}
		}

		if !authed {
			continue
		}
	}
}

func (r *JpdictRunner) handleEvent(
	ctx context.Context,
	logPrefix string,
	raw string,
	emit func(event string, payload any) error,
) error {
	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return err
	}
	if len(arr) == 0 {
		return nil
	}

	var eventName string
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return err
	}
	if eventName != "MESSAGE_CREATE" {
		return nil
	}
	if len(arr) < 2 {
		return nil
	}

	var msg socketMessage
	if err := json.Unmarshal(arr[1], &msg); err != nil {
		return err
	}
	for i := range msg.Attachments {
		msg.Attachments[i].ChannelID = msg.ChannelID
	}

	if r.isOwnMessage(msg.AuthorID) {
		return nil
	}

	out, ok, err := r.maybeHandleMessage(ctx, msg)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	if err := emit("message/create", map[string]any{
		"channelId": msg.ChannelID,
		"type":      out.Type,
		"content":   out.Content,
		"payload":   out.Payload,
	}); err != nil {
		return fmt.Errorf("send message failed: %w", err)
	}
	log.Printf("%s replied: channel=%s", logPrefix, msg.ChannelID)
	return nil
}

func (r *JpdictRunner) maybeHandleMessage(ctx context.Context, msg socketMessage) (out outboundMessage, ok bool, err error) {
	trimmed := strings.TrimSpace(msg.Content)
	attachments := msg.Attachments

	// Channel: require a leading mention.
	if rest, mentioned := stripLeadingBotMention(trimmed, r.botUserID); mentioned {
		return r.handleQuery(ctx, rest, attachments)
	}

	// DM: no mention required, but must be in a DM channel.
	if !r.isDMChannel(msg.ChannelID) {
		if err := r.refreshDMChannels(ctx); err != nil {
			return outboundMessage{}, false, err
		}
		if !r.isDMChannel(msg.ChannelID) {
			return outboundMessage{}, false, nil
		}
	}
	return r.handleQuery(ctx, trimmed, attachments)
}

func (r *JpdictRunner) handleQuery(ctx context.Context, input string, attachments []socketAttachment) (outboundMessage, bool, error) {
	text := strings.TrimSpace(input)
	if text == "" && len(attachments) == 0 {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: "",
			Payload: map[string]any{"content": "请输入有效的学习内容。"},
		}, true, nil
	}

	reply, err := r.queryLLM(ctx, text, attachments)
	if err != nil {
		return outboundMessage{
			Type:    jpdictCardMessageType,
			Content: "",
			Payload: map[string]any{"content": "请求失败：" + err.Error()},
		}, true, nil
	}

	return outboundMessage{
		Type:    jpdictCardMessageType,
		Content: "",
		Payload: map[string]any{"content": reply},
	}, true, nil
}

func (r *JpdictRunner) queryLLM(ctx context.Context, text string, attachments []socketAttachment) (string, error) {
	r.cfgMu.RLock()
	cfg := r.cfg
	r.cfgMu.RUnlock()

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	apiKey := strings.TrimSpace(cfg.APIKey)
	model := strings.TrimSpace(cfg.Model)
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	if apiKey == "" {
		return "", fmt.Errorf("jpdict-agent config incomplete: api_key is required")
	}

	prompt := jpdictSystemPrompt

	parts, err := r.buildUserContentParts(ctx, strings.TrimSpace(text), attachments)
	if err != nil {
		return "", err
	}

	reqBody := chatCompletionsRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: prompt},
			{Role: "user", Content: parts},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := r.llmHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("llm status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed chatCompletionsResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("parse llm response: %w", err)
	}
	content := strings.TrimSpace(parsed.FirstContent())
	if content == "" {
		return "", fmt.Errorf("llm returned empty content")
	}
	return content, nil
}

func (r *JpdictRunner) buildUserContentParts(
	ctx context.Context,
	text string,
	attachments []socketAttachment,
) (any, error) {
	const maxImageBytes = int64(5 * 1024 * 1024)
	const maxTotalBytes = int64(12 * 1024 * 1024)

	images := make([]socketAttachment, 0, len(attachments))
	for _, a := range attachments {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(a.ContentType)), "image/") {
			continue
		}
		if strings.TrimSpace(a.URL) == "" && strings.TrimSpace(a.Key) == "" {
			continue
		}
		images = append(images, a)
	}

	if len(images) == 0 {
		if text == "" {
			text = "请帮我查询/翻译这段内容。"
		}
		return text, nil
	}

	if text == "" {
		text = "请识别图片中的文字，并给出释义与翻译（如适用）。"
	}

	total := int64(0)
	parts := make([]contentPart, 0, 1+len(images))
	parts = append(parts, contentPart{Type: "text", Text: text})

	for _, img := range images {
		if img.Size > 0 && img.Size > maxImageBytes {
			continue
		}
		if total > maxTotalBytes {
			break
		}

		data, err := r.downloadAttachmentBytes(ctx, img, maxImageBytes)
		if err != nil {
			continue
		}
		total += int64(len(data))
		if total > maxTotalBytes {
			break
		}

		mime := strings.TrimSpace(img.ContentType)
		if mime == "" {
			mime = "image/png"
		}
		dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
		parts = append(parts, contentPart{
			Type: "image_url",
			ImageURL: &imageURLPayload{
				URL: dataURL,
			},
		})
	}

	return parts, nil
}

func (r *JpdictRunner) downloadAttachmentBytes(ctx context.Context, img socketAttachment, limit int64) ([]byte, error) {
	if limit <= 0 {
		limit = 5 * 1024 * 1024
	}

	key := strings.TrimSpace(img.Key)
	channelID := strings.TrimSpace(img.ChannelID)
	if key != "" && channelID != "" {
		u := fmt.Sprintf("%s/channels/%s/uploads/%s", r.apiBase, url.PathEscape(channelID), url.PathEscape(key))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+r.userToken)
		resp, err := r.mewHTTPClient.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return io.ReadAll(io.LimitReader(resp.Body, limit))
			}
		}
	}

	rawURL := strings.TrimSpace(img.URL)
	if rawURL == "" {
		return nil, fmt.Errorf("missing attachment url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := r.llmHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download status=%d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

func parseJpdictConfig(raw string) (JpdictConfig, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "{}" {
		return JpdictConfig{}, nil
	}
	var cfg JpdictConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return JpdictConfig{}, fmt.Errorf("invalid config JSON: %w", err)
	}
	return cfg, nil
}

// ---- LLM types (OpenAI-compatible chat/completions) ----

type chatCompletionsRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type contentPart struct {
	Type     string           `json:"type"`
	Text     string           `json:"text,omitempty"`
	ImageURL *imageURLPayload `json:"image_url,omitempty"`
}

type imageURLPayload struct {
	URL string `json:"url"`
}

type chatCompletionsResponse struct {
	Choices []struct {
		Message struct {
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (r chatCompletionsResponse) FirstContent() string {
	if len(r.Choices) == 0 {
		return ""
	}

	raw := bytes.TrimSpace(r.Choices[0].Message.Content)
	if len(raw) == 0 {
		return ""
	}

	var s string
	if raw[0] == '"' {
		if err := json.Unmarshal(raw, &s); err == nil {
			return s
		}
	}

	// Some providers may return content as an array; best-effort join text parts.
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type != "text" || strings.TrimSpace(p.Text) == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Text)
		}
		return b.String()
	}

	return strings.TrimSpace(string(raw))
}

// ---- MEW / gateway helpers (mostly copied from test-agent) ----

type socketMessage struct {
	ChannelID    string             `json:"channelId"`
	Content      string             `json:"content"`
	Attachments  []socketAttachment `json:"attachments"`
	AuthorID     json.RawMessage    `json:"authorId"`
	ReferencedID string             `json:"referencedMessageId,omitempty"`
}

type socketAttachment struct {
	ChannelID string `json:"-"`

	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

type meUser struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	IsBot    bool   `json:"isBot"`
}

func (r *JpdictRunner) isOwnMessage(authorRaw json.RawMessage) bool {
	authorRaw = bytes.TrimSpace(authorRaw)
	if len(authorRaw) == 0 || authorRaw[0] != '{' {
		return false
	}
	var author struct {
		ID    string `json:"_id"`
		IsBot bool   `json:"isBot"`
	}
	if err := json.Unmarshal(authorRaw, &author); err != nil {
		return false
	}
	if strings.TrimSpace(author.ID) == "" {
		return false
	}
	return author.ID == r.botUserID
}

func socketIOWebsocketURL(mewURL string) (string, error) {
	u, err := url.Parse(mewURL)
	if err != nil {
		return "", err
	}

	switch strings.ToLower(u.Scheme) {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("invalid MEW_URL scheme: %q", u.Scheme)
	}

	u.Path = "/socket.io/"
	q := u.Query()
	q.Set("EIO", "4")
	q.Set("transport", "websocket")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func splitSocketIOFrames(msg []byte) [][]byte {
	if bytes.IndexByte(msg, 0x1e) < 0 {
		return [][]byte{msg}
	}
	parts := bytes.Split(msg, []byte{0x1e})
	out := make([][]byte, 0, len(parts))
	for _, p := range parts {
		if len(p) == 0 {
			continue
		}
		out = append(out, p)
	}
	return out
}

var mentionRECache sync.Map // key: botUserID string -> *regexp.Regexp

func stripLeadingBotMention(content, botUserID string) (rest string, ok bool) {
	if strings.TrimSpace(botUserID) == "" {
		return "", false
	}
	reAny, _ := mentionRECache.LoadOrStore(botUserID, regexp.MustCompile(`^\s*<@!?`+regexp.QuoteMeta(botUserID)+`>\s*`))
	re := reAny.(*regexp.Regexp)
	loc := re.FindStringIndex(content)
	if loc == nil || loc[0] != 0 {
		return "", false
	}
	rest = strings.TrimSpace(content[loc[1]:])
	if rest == "" {
		// Allow mention-only messages to be treated as "empty query" when images exist.
		return "", true
	}
	return rest, true
}

func (r *JpdictRunner) isDMChannel(channelID string) bool {
	r.dmMu.RLock()
	defer r.dmMu.RUnlock()
	_, ok := r.dmChannelID[channelID]
	return ok
}

func (r *JpdictRunner) refreshDMChannels(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.apiBase+"/users/@me/channels", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.userToken)

	resp, err := r.mewHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var channels []struct {
		ID   string `json:"_id"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &channels); err != nil {
		return err
	}

	next := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		if strings.TrimSpace(ch.ID) == "" {
			continue
		}
		if ch.Type != "DM" {
			continue
		}
		next[ch.ID] = struct{}{}
	}

	r.dmMu.Lock()
	r.dmChannelID = next
	r.dmMu.Unlock()
	return nil
}

func (r *JpdictRunner) loginBot(ctx context.Context) (me meUser, token string, err error) {
	reqBody, err := json.Marshal(map[string]any{"accessToken": r.accessToken})
	if err != nil {
		return meUser{}, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.apiBase+"/auth/bot", bytes.NewReader(reqBody))
	if err != nil {
		return meUser{}, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.mewHTTPClient.Do(req)
	if err != nil {
		return meUser{}, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return meUser{}, "", fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		User  meUser `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return meUser{}, "", err
	}
	if strings.TrimSpace(parsed.User.ID) == "" || strings.TrimSpace(parsed.Token) == "" {
		return meUser{}, "", fmt.Errorf("invalid /auth/bot response: missing user/token")
	}

	return parsed.User, parsed.Token, nil
}

func newMewUserHTTPClient() (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil // default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)

	if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
		proxyFunc, err := httpx.ProxyFuncFromString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
		}
		transport.Proxy = proxyFunc
	}

	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
	}, nil
}

func newExternalHTTPClient() (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()

	// Keep proxy behavior aligned with MEW_API_PROXY to avoid surprising env proxy usage.
	transport.Proxy = nil
	if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
		proxyFunc, err := httpx.ProxyFuncFromString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
		}
		transport.Proxy = proxyFunc
	}

	return &http.Client{
		Transport: transport,
		Timeout:   75 * time.Second,
	}, nil
}
