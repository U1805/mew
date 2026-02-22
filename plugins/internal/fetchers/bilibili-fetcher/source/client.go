package source

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	BiliUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
	BiliReferer   = "https://space.bilibili.com/"

	biliFeatures  = "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,forwardListHidden,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment,eva3CardUser"
	biliWebGLStr  = "WebGL 1.0 (OpenGL ES 2.0 Chromium)"
	biliRenderStr = "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) " +
		"Direct3D11 vs_5_0 ps_5_0, D3D11)Google Inc. (NVIDIA)"
)

var wbiMixinKeyEncTab = []int{
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50,
	10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
	33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
	41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
	26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
	54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
	20, 34, 44, 52,
}

type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{httpClient: httpClient}
}

func (c *Client) FetchDynamicsRaw(ctx context.Context, uid, offset string) ([]byte, error) {
	targetUID := strings.TrimSpace(uid)
	if targetUID == "" {
		return nil, fmt.Errorf("uid required")
	}

	httpClient := ensureClient(c.httpClient)
	headers := map[string]string{
		"User-Agent": BiliUserAgent,
		"Referer":    fmt.Sprintf("https://space.bilibili.com/%s/dynamic", targetUID),
		"Origin":     "https://space.bilibili.com",
	}

	if err := warmupSpaceDynamic(ctx, httpClient, targetUID, headers); err != nil {
		return nil, err
	}
	if err := refreshSPICookie(ctx, httpClient, headers); err != nil {
		return nil, err
	}

	targetURL := "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space"
	const retry412Attempts = 4
	totalAttempts := retry412Attempts + 1
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))

	var lastStatus int
	lastAPIAntiAbuse := 0
	for attempt := 0; attempt < totalAttempts; attempt++ {
		if attempt > 0 {
			backoff := 350 * time.Millisecond * time.Duration(1<<(attempt-1))
			if backoff > 3*time.Second {
				backoff = 3 * time.Second
			}
			jitter := time.Duration(rnd.Float64() * float64(backoff) * 0.35)
			if err := sleepWithContext(ctx, backoff+jitter); err != nil {
				return nil, err
			}
			_ = warmupSpaceDynamic(ctx, httpClient, targetUID, headers)
			_ = refreshSPICookie(ctx, httpClient, headers)
		}

		imgKey, subKey, err := fetchWBIKeys(ctx, httpClient, headers)
		if err != nil {
			return nil, err
		}

		params := baseDynamicParams(targetUID, offset)
		signWBI(params, imgKey, subKey)

		reqURL, err := urlWithQuery(targetURL, params)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}

		lastStatus = resp.StatusCode
		if resp.StatusCode == http.StatusPreconditionFailed {
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("unexpected status: %s (body=%s)", resp.Status, string(body))
		}

		var envelope struct {
			Code int `json:"code"`
		}
		if err := json.Unmarshal(body, &envelope); err == nil && envelope.Code == -352 {
			lastAPIAntiAbuse = -352
			continue
		}
		return body, nil
	}

	if lastStatus == http.StatusPreconditionFailed {
		return nil, fmt.Errorf("bilibili anti-abuse rejected request (HTTP 412)")
	}
	if lastAPIAntiAbuse == -352 {
		return nil, fmt.Errorf("bilibili anti-abuse rejected request (api code=-352)")
	}
	return nil, fmt.Errorf("failed to fetch bilibili dynamics")
}

func (c *Client) FetchDynamics(ctx context.Context, uid string) ([]APIItem, error) {
	body, err := c.FetchDynamicsRaw(ctx, uid, "")
	if err != nil {
		return nil, err
	}
	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode json: %w (body=%s)", err, string(body))
	}
	if apiResp.Code != 0 {
		return nil, fmt.Errorf("api error: code=%d, message=%s", apiResp.Code, apiResp.Message)
	}
	return apiResp.Data.Items, nil
}

func ensureClient(client *http.Client) *http.Client {
	if client == nil {
		jar, _ := cookiejar.New(nil)
		return &http.Client{
			Timeout: 20 * time.Second,
			Jar:     jar,
		}
	}
	if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		client.Jar = jar
	}
	return client
}

func warmupSpaceDynamic(ctx context.Context, client *http.Client, uid string, headers map[string]string) error {
	warmURL := fmt.Sprintf("https://space.bilibili.com/%s/dynamic", uid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, warmURL, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return nil
}

type spiResponse struct {
	Data struct {
		B3 string `json:"b_3"`
		B4 string `json:"b_4"`
	} `json:"data"`
}

func refreshSPICookie(ctx context.Context, client *http.Client, headers map[string]string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.bilibili.com/x/frontend/finger/spi", nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("spi request failed: %s (body=%s)", resp.Status, string(body))
	}

	var spi spiResponse
	if err := json.Unmarshal(body, &spi); err != nil {
		return fmt.Errorf("decode spi json: %w", err)
	}

	apiURL, _ := url.Parse("https://api.bilibili.com/")
	if client.Jar != nil && apiURL != nil {
		cookies := make([]*http.Cookie, 0, 2)
		if spi.Data.B3 != "" {
			cookies = append(cookies, &http.Cookie{Name: "buvid3", Value: spi.Data.B3, Domain: ".bilibili.com", Path: "/"})
		}
		if spi.Data.B4 != "" {
			cookies = append(cookies, &http.Cookie{Name: "buvid4", Value: spi.Data.B4, Domain: ".bilibili.com", Path: "/"})
		}
		if len(cookies) > 0 {
			client.Jar.SetCookies(apiURL, cookies)
		}
	}
	return nil
}

type navResponse struct {
	Data struct {
		WBIImg struct {
			ImgURL string `json:"img_url"`
			SubURL string `json:"sub_url"`
		} `json:"wbi_img"`
	} `json:"data"`
}

func fetchWBIKeys(ctx context.Context, client *http.Client, headers map[string]string) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.bilibili.com/x/web-interface/nav", nil)
	if err != nil {
		return "", "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return "", "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("nav request failed: %s (body=%s)", resp.Status, string(body))
	}

	var nav navResponse
	if err := json.Unmarshal(body, &nav); err != nil {
		return "", "", fmt.Errorf("decode nav json: %w", err)
	}
	imgKey := extractWBIKey(nav.Data.WBIImg.ImgURL)
	subKey := extractWBIKey(nav.Data.WBIImg.SubURL)
	if imgKey == "" || subKey == "" {
		return "", "", fmt.Errorf("missing wbi keys in nav response")
	}
	return imgKey, subKey, nil
}

func extractWBIKey(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	last := raw
	if i := strings.LastIndexByte(raw, '/'); i >= 0 && i+1 < len(raw) {
		last = raw[i+1:]
	}
	if dot := strings.IndexByte(last, '.'); dot > 0 {
		return last[:dot]
	}
	return last
}

func baseDynamicParams(uid, offset string) map[string]string {
	params := map[string]string{
		"host_mid":               uid,
		"offset":                 offset,
		"timezone_offset":        "-480",
		"platform":               "web",
		"features":               biliFeatures,
		"web_location":           "333.1387",
		"x-bili-device-req-json": `{"platform":"web","device":"pc","spmid":"333.1387"}`,
	}
	dm := generateDMParams()
	for k, v := range dm {
		params[k] = v
	}
	return params
}

func generateDMParams() map[string]string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	baseTS := []int{1618, 1730, 1859, 1960, 696877, 696984}

	type dmEvent struct {
		X         int `json:"x"`
		Y         int `json:"y"`
		Z         int `json:"z"`
		Timestamp int `json:"timestamp"`
		K         int `json:"k"`
		Type      int `json:"type"`
	}

	events := make([]dmEvent, 0, len(baseTS))
	for _, ts := range baseTS {
		events = append(events, dmEvent{
			X:         r.Intn(5300-3500+1) + 3500,
			Y:         r.Intn(3000-(-800)+1) - 800,
			Z:         r.Intn(600-0+1) + 0,
			Timestamp: ts,
			K:         r.Intn(120-60+1) + 60,
			Type:      0,
		})
	}
	eventsJSON, _ := json.Marshal(events)

	wh2 := r.Intn(130-20+1) + 20
	wh0 := r.Intn(5800-5400+1) + 5400
	wh1 := r.Intn(3200-3000+1) + 3000
	of0 := r.Intn(380-50+1) + 50
	dmInter := map[string]any{
		"ds": []any{},
		"wh": []int{wh0, wh1, wh2},
		"of": []int{of0, of0 * 2, of0},
	}
	interJSON, _ := json.Marshal(dmInter)

	return map[string]string{
		"dm_img_list":      string(eventsJSON),
		"dm_img_str":       b64WithoutTail(biliWebGLStr),
		"dm_cover_img_str": b64WithoutTail(biliRenderStr),
		"dm_img_inter":     string(interJSON),
	}
}

func b64WithoutTail(text string) string {
	s := base64.StdEncoding.EncodeToString([]byte(text))
	if len(s) > 2 {
		return s[:len(s)-2]
	}
	return s
}

func signWBI(params map[string]string, imgKey, subKey string) {
	if params == nil {
		return
	}
	params["wts"] = strconv.FormatInt(time.Now().Unix(), 10)
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	ordered := make([]string, 0, len(keys))
	for _, k := range keys {
		ordered = append(ordered, url.QueryEscape(k)+"="+url.QueryEscape(stripWBIChars(params[k])))
	}
	query := strings.Join(ordered, "&")
	mix := mixinKey(imgKey + subKey)
	sum := md5.Sum([]byte(query + mix))
	params["w_rid"] = fmt.Sprintf("%x", sum)
}

func mixinKey(origin string) string {
	var b strings.Builder
	for _, idx := range wbiMixinKeyEncTab {
		if idx >= 0 && idx < len(origin) {
			b.WriteByte(origin[idx])
		}
	}
	s := b.String()
	if len(s) > 32 {
		return s[:32]
	}
	return s
}

func stripWBIChars(s string) string {
	if s == "" {
		return s
	}
	replacer := strings.NewReplacer("!", "", "'", "", "(", "", ")", "", "*", "")
	return replacer.Replace(s)
}

func urlWithQuery(rawURL string, params map[string]string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
