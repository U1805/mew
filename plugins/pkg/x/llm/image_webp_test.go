package llm

import (
	"bytes"
	"image"
	"image/png"
	"os/exec"
	"testing"

	xwebp "golang.org/x/image/webp"
)

func TestCompressImageToWebP_ResizesToMaxDim(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not found in PATH")
	}

	src := image.NewRGBA(image.Rect(0, 0, 2000, 1000))
	var buf bytes.Buffer
	if err := png.Encode(&buf, src); err != nil {
		t.Fatalf("png encode error: %v", err)
	}

	out, err := compressImageToWebP(buf.Bytes(), 720)
	if err != nil {
		t.Fatalf("compressImageToWebP error: %v", err)
	}

	cfg, err := xwebp.DecodeConfig(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("webp decodeconfig error: %v", err)
	}
	if cfg.Width > 720 || cfg.Height > 720 {
		t.Fatalf("expected max dim <= 720, got %dx%d", cfg.Width, cfg.Height)
	}
	if cfg.Width != 720 || cfg.Height != 360 {
		t.Fatalf("expected 720x360, got %dx%d", cfg.Width, cfg.Height)
	}
}
