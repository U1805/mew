package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"mew/plugins/internal/agents/assistant-agent/infra"
)

const hobbyistTTSUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0"

var HobbyistTTSEndpoint = infra.HobbyistTTSEndpoint

type hobbyistTTSRequest struct {
	Version           string  `json:"version"`
	ModelName         string  `json:"model_name"`
	PromptTextLang    string  `json:"prompt_text_lang"`
	Emotion           string  `json:"emotion"`
	Text              string  `json:"text"`
	TextLang          string  `json:"text_lang"`
	TopK              int     `json:"top_k"`
	TopP              float64 `json:"top_p"`
	Temperature       float64 `json:"temperature"`
	TextSplitMethod   string  `json:"text_split_method"`
	BatchSize         int     `json:"batch_size"`
	BatchThreshold    float64 `json:"batch_threshold"`
	SplitBucket       bool    `json:"split_bucket"`
	SpeedFacter       float64 `json:"speed_facter"`
	FragmentInterval  float64 `json:"fragment_interval"`
	MediaType         string  `json:"media_type"`
	ParallelInfer     bool    `json:"parallel_infer"`
	RepetitionPenalty float64 `json:"repetition_penalty"`
	Seed              int     `json:"seed"`
	SampleSteps       int     `json:"sample_steps"`
	IfSR              bool    `json:"if_sr"`
}

type hobbyistTTSResponse struct {
	Msg      string `json:"msg"`
	AudioURL string `json:"audio_url"`
}

// RunHobbyistTTS calls Hobbyist TTS (`/infer_single`) and returns an audio URL.
// It uses config `tool.hobbyist_tts_token` for Authorization.
func RunHobbyistTTS(c infra.LLMCallContext, text string) (string, error) {
	ctx := infra.ContextOrBackground(c.Ctx)

	text = strings.TrimSpace(text)
	if text == "" {
		return "", fmt.Errorf("tts text is required")
	}
	token := strings.TrimSpace(c.Config.Tool.HobbyistTTSToken)
	if token == "" {
		return "", fmt.Errorf("assistant-agent config incomplete: tool.hobbyist_tts_token is required for Voice")
	}
	if c.HTTPClient == nil {
		c.HTTPClient = http.DefaultClient
	}

	reqBody := hobbyistTTSRequest{
		Version:           "v4",
		ModelName:         "蔚蓝档案-日语-佳代子（正月）",
		PromptTextLang:    "日语",
		Emotion:           "默认",
		Text:              text,
		TextLang:          "日语",
		TopK:              10,
		TopP:              1,
		Temperature:       1,
		TextSplitMethod:   "按标点符号切",
		BatchSize:         10,
		BatchThreshold:    0.75,
		SplitBucket:       true,
		SpeedFacter:       1,
		FragmentInterval:  0.3,
		MediaType:         "wav",
		ParallelInfer:     true,
		RepetitionPenalty: 1.35,
		Seed:              -1,
		SampleSteps:       16,
		IfSR:              false,
	}

	b, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, HobbyistTTSEndpoint, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", hobbyistTTSUserAgent)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("tts status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out hobbyistTTSResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.AudioURL) == "" {
		return "", fmt.Errorf("tts response missing audio_url (msg=%q)", strings.TrimSpace(out.Msg))
	}
	return strings.TrimSpace(out.AudioURL), nil
}
