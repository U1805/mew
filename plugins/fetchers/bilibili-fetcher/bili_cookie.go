package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/bits"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

const (
	biliUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
	biliReferer   = "https://www.bilibili.com/"
	biliSPIURL    = "https://api.bilibili.com/x/frontend/finger/spi"
	biliActiveURL = "https://api.bilibili.com/x/internal/gaur/activate"
)

type biliSPIResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Buvid3 string `json:"b_3"`
		Buvid4 string `json:"b_4"`
	} `json:"data"`
}

type biliActivateResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func getTimeMilli() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}

// genUUIDInfoc generates bilibili-style _uuid, similar to test.py's gen_uuid_infoc().
func genUUIDInfoc() string {
	t := getTimeMilli() % 100000
	choices := []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "10"}
	parts := []int{8, 4, 4, 4, 12}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	genPart := func(n int) string {
		var b strings.Builder
		b.Grow(n * 2)
		for i := 0; i < n; i++ {
			b.WriteString(choices[r.Intn(len(choices))])
		}
		return b.String()
	}

	var pieces []string
	for _, n := range parts {
		pieces = append(pieces, genPart(n))
	}

	suffix := fmt.Sprintf("%d", t)
	for len(suffix) < 5 {
		suffix += "0"
	}
	return strings.Join(pieces, "-") + suffix + "infoc"
}

func fmix64(k uint64) uint64 {
	k ^= k >> 33
	k *= 0xff51afd7ed558ccd
	k ^= k >> 33
	k *= 0xc4ceb9fe1a85ec53
	k ^= k >> 33
	return k
}

// murmur3x64_128 returns (h1, h2) for MurmurHash3 x64 128.
func murmur3x64_128(data []byte, seed uint32) (uint64, uint64) {
	const (
		c1 = 0x87c37b91114253d5
		c2 = 0x4cf5ad432745937f
	)

	h1 := uint64(seed)
	h2 := uint64(seed)

	nblocks := len(data) / 16
	for i := 0; i < nblocks; i++ {
		block := data[i*16:]
		k1 := binary.LittleEndian.Uint64(block[0:8])
		k2 := binary.LittleEndian.Uint64(block[8:16])

		k1 *= c1
		k1 = bits.RotateLeft64(k1, 31)
		k1 *= c2
		h1 ^= k1

		h1 = bits.RotateLeft64(h1, 27)
		h1 += h2
		h1 = h1*5 + 0x52dce729

		k2 *= c2
		k2 = bits.RotateLeft64(k2, 33)
		k2 *= c1
		h2 ^= k2

		h2 = bits.RotateLeft64(h2, 31)
		h2 += h1
		h2 = h2*5 + 0x38495ab5
	}

	// Tail
	tail := data[nblocks*16:]
	var k1, k2 uint64
	switch len(tail) & 15 {
	case 15:
		k2 ^= uint64(tail[14]) << 48
		fallthrough
	case 14:
		k2 ^= uint64(tail[13]) << 40
		fallthrough
	case 13:
		k2 ^= uint64(tail[12]) << 32
		fallthrough
	case 12:
		k2 ^= uint64(tail[11]) << 24
		fallthrough
	case 11:
		k2 ^= uint64(tail[10]) << 16
		fallthrough
	case 10:
		k2 ^= uint64(tail[9]) << 8
		fallthrough
	case 9:
		k2 ^= uint64(tail[8])
		k2 *= c2
		k2 = bits.RotateLeft64(k2, 33)
		k2 *= c1
		h2 ^= k2
		fallthrough
	case 8:
		k1 ^= uint64(tail[7]) << 56
		fallthrough
	case 7:
		k1 ^= uint64(tail[6]) << 48
		fallthrough
	case 6:
		k1 ^= uint64(tail[5]) << 40
		fallthrough
	case 5:
		k1 ^= uint64(tail[4]) << 32
		fallthrough
	case 4:
		k1 ^= uint64(tail[3]) << 24
		fallthrough
	case 3:
		k1 ^= uint64(tail[2]) << 16
		fallthrough
	case 2:
		k1 ^= uint64(tail[1]) << 8
		fallthrough
	case 1:
		k1 ^= uint64(tail[0])
		k1 *= c1
		k1 = bits.RotateLeft64(k1, 31)
		k1 *= c2
		h1 ^= k1
	}

	length := uint64(len(data))
	h1 ^= length
	h2 ^= length

	h1 += h2
	h2 += h1

	h1 = fmix64(h1)
	h2 = fmix64(h2)

	h1 += h2
	h2 += h1

	return h1, h2
}

func genBuvidFP(payload string, seed uint32) string {
	h1, h2 := murmur3x64_128([]byte(payload), seed)
	return fmt.Sprintf("%x%x", h1, h2)
}

func getBuvidActivatePayload(userAgent string) (string, error) {
	inner := map[string]any{
		"3064": 1,
		"5062": getTimeMilli(),
		"03bf": "https%3A%2F%2Fwww.bilibili.com%2F",
		"39c8": "333.788.fp.risk",
		// "34f1": "",
		// "d402": "",
		// "654a": "",
		// "6e7c": "839x959",
		"3c43": map[string]any{
			// "2673": 0,
			// "5766": 24,
			// "6527": 0,
			// "7003": 1,
			// "807e": 1,
			"b8ce": userAgent,
			// "641c": 0,
			"07a4": "en-US",
		// 	"1c57": "not available",
		// 	"0bd0": 8,
		// 	"748e": []int{900, 1440},
		// 	"d61f": []int{875, 1440},
		// 	"fc9d": -480,
		// 	"6aa9": "Asia/Shanghai",
		// 	"75b8": 1,
		// 	"3b21": 1,
		// 	"8a1c": 0,
		// 	"d52f": "not available",
		// 	"adca": "MacIntel",
		// 	"80c9": []any{
		// 		[]any{
		// 			"PDF Viewer",
		// 			"Portable Document Format",
		// 			[][]string{{"application/pdf", "pdf"}, {"text/pdf", "pdf"}},
		// 		},
		// 		[]any{
		// 			"Chrome PDF Viewer",
		// 			"Portable Document Format",
		// 			[][]string{{"application/pdf", "pdf"}, {"text/pdf", "pdf"}},
		// 		},
		// 		[]any{
		// 			"Chromium PDF Viewer",
		// 			"Portable Document Format",
		// 			[][]string{{"application/pdf", "pdf"}, {"text/pdf", "pdf"}},
		// 		},
		// 		[]any{
		// 			"Microsoft Edge PDF Viewer",
		// 			"Portable Document Format",
		// 			[][]string{{"application/pdf", "pdf"}, {"text/pdf", "pdf"}},
		// 		},
		// 		[]any{
		// 			"WebKit built-in PDF",
		// 			"Portable Document Format",
		// 			[][]string{{"application/pdf", "pdf"}, {"text/pdf", "pdf"}},
		// 		},
		// 	},
		// 	"13ab": "0dAAAAAASUVORK5CYII=",
		// 	"bfe9": "QgAAEIQAACEIAABCCQN4FXANGq7S8KTZayAAAAAElFTkSuQmCC",
		// 	"a3c1": []string{
		// 		"extensions:ANGLE_instanced_arrays;EXT_blend_minmax;EXT_color_buffer_half_float;EXT_float_blend;EXT_frag_depth;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBKIT_WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw",
		// 		"webgl aliased line width range:[1, 1]",
		// 		"webgl aliased point size range:[1, 511]",
		// 		"webgl alpha bits:8",
		// 		"webgl antialiasing:yes",
		// 		"webgl blue bits:8",
		// 		"webgl depth bits:24",
		// 		"webgl green bits:8",
		// 		"webgl max anisotropy:16",
		// 		"webgl max combined texture image units:32",
		// 		"webgl max cube map texture size:16384",
		// 		"webgl max fragment uniform vectors:1024",
		// 		"webgl max render buffer size:16384",
		// 		"webgl max texture image units:16",
		// 		"webgl max texture size:16384",
		// 		"webgl max varying vectors:30",
		// 		"webgl max vertex attribs:16",
		// 		"webgl max vertex texture image units:16",
		// 		"webgl max vertex uniform vectors:1024",
		// 		"webgl max viewport dims:[16384, 16384]",
		// 		"webgl red bits:8",
		// 		"webgl renderer:WebKit WebGL",
		// 		"webgl shading language version:WebGL GLSL ES 1.0 (1.0)",
		// 		"webgl stencil bits:0",
		// 		"webgl vendor:WebKit",
		// 		"webgl version:WebGL 1.0",
		// 		"webgl unmasked vendor:Apple Inc.",
		// 		"webgl unmasked renderer:Apple GPU",
		// 		"webgl vertex shader high float precision:23",
		// 		"webgl vertex shader high float precision rangeMin:127",
		// 		"webgl vertex shader high float precision rangeMax:127",
		// 		"webgl vertex shader medium float precision:23",
		// 		"webgl vertex shader medium float precision rangeMin:127",
		// 		"webgl vertex shader medium float precision rangeMax:127",
		// 		"webgl vertex shader low float precision:23",
		// 		"webgl vertex shader low float precision rangeMin:127",
		// 		"webgl vertex shader low float precision rangeMax:127",
		// 		"webgl fragment shader high float precision:23",
		// 		"webgl fragment shader high float precision rangeMin:127",
		// 		"webgl fragment shader high float precision rangeMax:127",
		// 		"webgl fragment shader medium float precision:23",
		// 		"webgl fragment shader medium float precision rangeMin:127",
		// 		"webgl fragment shader medium float precision rangeMax:127",
		// 		"webgl fragment shader low float precision:23",
		// 		"webgl fragment shader low float precision rangeMin:127",
		// 		"webgl fragment shader low float precision rangeMax:127",
		// 		"webgl vertex shader high int precision:0",
		// 		"webgl vertex shader high int precision rangeMin:31",
		// 		"webgl vertex shader high int precision rangeMax:30",
		// 		"webgl vertex shader medium int precision:0",
		// 		"webgl vertex shader medium int precision rangeMin:31",
		// 		"webgl vertex shader medium int precision rangeMax:30",
		// 		"webgl vertex shader low int precision:0",
		// 		"webgl vertex shader low int precision rangeMin:31",
		// 		"webgl vertex shader low int precision rangeMax:30",
		// 		"webgl fragment shader high int precision:0",
		// 		"webgl fragment shader high int precision rangeMin:31",
		// 		"webgl fragment shader high int precision rangeMax:30",
		// 		"webgl fragment shader medium int precision:0",
		// 		"webgl fragment shader medium int precision rangeMin:31",
		// 		"webgl fragment shader medium int precision rangeMax:30",
		// 		"webgl fragment shader low int precision:0",
		// 		"webgl fragment shader low int precision rangeMin:31",
		// 		"webgl fragment shader low int precision rangeMax:30",
		// 	},
		// 	"6bc5": "Apple Inc.~Apple GPU",
		// 	"ed31": 0,
		// 	"72bd": 0,
		// 	"097b": 0,
		// 	"52cd": []int{0, 0, 0},
		// 	"a658": []string{
		// 		"Andale Mono",
		// 		"Arial",
		// 		"Arial Black",
		// 		"Arial Hebrew",
		// 		"Arial Narrow",
		// 		"Arial Rounded MT Bold",
		// 		"Arial Unicode MS",
		// 		"Comic Sans MS",
		// 		"Courier",
		// 		"Courier New",
		// 		"Geneva",
		// 		"Georgia",
		// 		"Helvetica",
		// 		"Helvetica Neue",
		// 		"Impact",
		// 		"LUCIDA GRANDE",
		// 		"Microsoft Sans Serif",
		// 		"Monaco",
		// 		"Palatino",
		// 		"Tahoma",
		// 		"Times",
		// 		"Times New Roman",
		// 		"Trebuchet MS",
		// 		"Verdana",
		// 		"Wingdings",
		// 		"Wingdings 2",
		// 		"Wingdings 3",
		// 	},
		// 	"d02f": "124.04345259929687",
		},
		// "54ef": `{"in_new_ab":true,"ab_version":{"remove_back_version":"REMOVE","login_dialog_version":"V_PLAYER_PLAY_TOAST","open_recommend_blank":"SELF","storage_back_btn":"HIDE","call_pc_app":"FORBID","clean_version_old":"GO_NEW","optimize_fmp_version":"LOADED_METADATA","for_ai_home_version":"V_OTHER","bmg_fallback_version":"DEFAULT","ai_summary_version":"SHOW","weixin_popup_block":"ENABLE","rcmd_tab_version":"DISABLE","in_new_ab":true},"ab_split_num":{"remove_back_version":11,"login_dialog_version":43,"open_recommend_blank":90,"storage_back_btn":87,"call_pc_app":47,"clean_version_old":46,"optimize_fmp_version":28,"for_ai_home_version":38,"bmg_fallback_version":86,"ai_summary_version":466,"weixin_popup_block":45,"rcmd_tab_version":90,"in_new_ab":0},"pageVersion":"new_video","videoGoOldVersion":-1}`,
		// "8b94": "https%3A%2F%2Fwww.bilibili.com%2F",
		// "df35": "2D9BA3CF-B1ED-1674-2492-CF103D9EFACFE46196infoc",
		// "07a4": "en-US",
		// "5f45": nil,
		// "db46": 0,
	}
	innerBytes, err := json.Marshal(inner)
	if err != nil {
		return "", err
	}

	outer := map[string]any{
		"payload": string(innerBytes),
	}
	outerBytes, err := json.Marshal(outer)
	if err != nil {
		return "", err
	}
	return string(outerBytes), nil
}

func requestBiliCookieHeader(ctx context.Context, client *http.Client) (string, error) {
	reqSPI, err := http.NewRequestWithContext(ctx, http.MethodGet, biliSPIURL, nil)
	if err != nil {
		return "", err
	}
	reqSPI.Header.Set("User-Agent", biliUserAgent)
	reqSPI.Header.Set("Referer", biliReferer)

	respSPI, err := client.Do(reqSPI)
	if err != nil {
		return "", err
	}
	spiBody, err := io.ReadAll(respSPI.Body)
	respSPI.Body.Close()
	if err != nil {
		return "", err
	}
	if respSPI.StatusCode < 200 || respSPI.StatusCode >= 300 {
		return "", fmt.Errorf("spi status: %s (body=%s)", respSPI.Status, string(spiBody))
	}

	var spi biliSPIResponse
	if err := json.Unmarshal(spiBody, &spi); err != nil {
		return "", fmt.Errorf("decode spi json: %w (body=%s)", err, string(spiBody))
	}
	if spi.Code != 0 || spi.Data.Buvid3 == "" {
		return "", fmt.Errorf("spi error: code=%d, message=%s", spi.Code, spi.Message)
	}

	uuid := genUUIDInfoc()
	payload, err := getBuvidActivatePayload(biliUserAgent)
	if err != nil {
		return "", err
	}
	buvidFP := genBuvidFP(payload, 31)

	cookies := []string{
		"buvid3=" + spi.Data.Buvid3,
		"buvid4=" + spi.Data.Buvid4,
		"buvid_fp=" + buvidFP,
		"_uuid=" + uuid,
	}
	cookieHeader := strings.Join(cookies, "; ")

	// Best-effort activate; even if it fails, we still return the fetched buvid3.
	reqActive, err := http.NewRequestWithContext(ctx, http.MethodPost, biliActiveURL, bytes.NewBufferString(payload))
	if err == nil {
		reqActive.Header.Set("User-Agent", biliUserAgent)
		reqActive.Header.Set("Referer", biliReferer)
		reqActive.Header.Set("Content-Type", "application/json")
		reqActive.Header.Set("Cookie", cookieHeader)

		respActive, err := client.Do(reqActive)
		if err == nil {
			activeBody, readErr := io.ReadAll(respActive.Body)
			respActive.Body.Close()
			if readErr == nil && respActive.StatusCode >= 200 && respActive.StatusCode < 300 {
				var activeResp biliActivateResponse
				_ = json.Unmarshal(activeBody, &activeResp)
			}
		}
	}

	return cookieHeader, nil
}
