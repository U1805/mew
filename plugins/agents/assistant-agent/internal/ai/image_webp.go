package ai

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"math"

	"github.com/chai2010/webp"
	xdraw "golang.org/x/image/draw"
)

func compressImageToWebP(data []byte, maxDim int) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty image")
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		img, err = webp.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
	}

	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid image bounds: %dx%d", w, h)
	}

	maxSide := w
	if h > maxSide {
		maxSide = h
	}
	if maxDim > 0 && maxSide > maxDim {
		scale := float64(maxDim) / float64(maxSide)
		nw := int(math.Round(float64(w) * scale))
		nh := int(math.Round(float64(h) * scale))
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}

		dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Src, nil)
		img = dst
	}

	var buf bytes.Buffer
	if err := webp.Encode(&buf, img, &webp.Options{Quality: 80}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

