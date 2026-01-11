package llm

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
	"os/exec"

	xwebp "golang.org/x/image/webp"
)

func compressImageToWebP(data []byte, maxDim int) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty image")
	}

	cwebpPath, err := exec.LookPath("cwebp")
	if err != nil {
		return nil, fmt.Errorf("cwebp not found in PATH: %w", err)
	}

	ext := guessImageExtension(data)
	in, err := os.CreateTemp("", "mew-img-*"+ext)
	if err != nil {
		return nil, err
	}
	inPath := in.Name()
	defer func() { _ = os.Remove(inPath) }()

	if _, err := in.Write(data); err != nil {
		_ = in.Close()
		return nil, err
	}
	if err := in.Close(); err != nil {
		return nil, err
	}

	out, err := os.CreateTemp("", "mew-out-*.webp")
	if err != nil {
		return nil, err
	}
	outPath := out.Name()
	_ = out.Close()
	defer func() { _ = os.Remove(outPath) }()

	args := []string{"-quiet", "-metadata", "none", "-q", "80"}
	if maxDim > 0 {
		if w, h, ok := decodeImageSize(data); ok {
			maxSide := w
			if h > maxSide {
				maxSide = h
			}
			if maxSide > maxDim {
				scale := float64(maxDim) / float64(maxSide)
				nw := int(math.Round(float64(w) * scale))
				nh := int(math.Round(float64(h) * scale))
				if nw < 1 {
					nw = 1
				}
				if nh < 1 {
					nh = 1
				}
				args = append(args, "-resize", fmt.Sprint(nw), fmt.Sprint(nh))
			}
		}
	}
	args = append(args, inPath, "-o", outPath)

	cmd := exec.Command(cwebpPath, args...)
	stderr := new(bytes.Buffer)
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return nil, fmt.Errorf("cwebp failed: %w: %s", err, stderr.String())
		}
		return nil, fmt.Errorf("cwebp failed: %w", err)
	}

	outBytes, err := os.ReadFile(outPath)
	if err != nil {
		return nil, err
	}
	return outBytes, nil
}

func decodeImageSize(data []byte) (w int, h int, ok bool) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err == nil && cfg.Width > 0 && cfg.Height > 0 {
		return cfg.Width, cfg.Height, true
	}
	cfg2, err := xwebp.DecodeConfig(bytes.NewReader(data))
	if err == nil && cfg2.Width > 0 && cfg2.Height > 0 {
		return cfg2.Width, cfg2.Height, true
	}
	return 0, 0, false
}

func guessImageExtension(data []byte) string {
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return ".webp"
	}
	if len(data) >= 8 {
		pngSig := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
		if bytes.Equal(data[:8], pngSig) {
			return ".png"
		}
	}
	if len(data) >= 6 {
		if string(data[:6]) == "GIF87a" || string(data[:6]) == "GIF89a" {
			return ".gif"
		}
	}
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return ".jpg"
	}
	return ".img"
}
