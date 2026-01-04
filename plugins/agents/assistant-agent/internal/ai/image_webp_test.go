package ai

import (
	"bytes"
	"image"
	"image/png"
	"testing"

	"github.com/chai2010/webp"
)

func TestCompressImageToWebP_ResizesToMaxDim(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 2000, 1000))
	var buf bytes.Buffer
	if err := png.Encode(&buf, src); err != nil {
		t.Fatalf("png encode error: %v", err)
	}

	out, err := compressImageToWebP(buf.Bytes(), 720)
	if err != nil {
		t.Fatalf("compressImageToWebP error: %v", err)
	}

	w, h, _, err := webp.GetInfo(out)
	if err != nil {
		t.Fatalf("webp getinfo error: %v", err)
	}
	if w > 720 || h > 720 {
		t.Fatalf("expected max dim <= 720, got %dx%d", w, h)
	}
	if w != 720 || h != 360 {
		t.Fatalf("expected 720x360, got %dx%d", w, h)
	}
}

