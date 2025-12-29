package agent

import (
	"fmt"
	"os"
	"strings"

	"mew/plugins/jpdict-agent/prompt"
	"mew/plugins/sdk"
)

func readPromptWithFallbacks(relPaths []string, embeddedName string) (string, error) {
	var searched []string
	var lastErr error

	for _, rel := range relPaths {
		paths := sdk.CandidateDataFilePaths(rel)
		searched = append(searched, paths...)
		for _, path := range paths {
			b, err := os.ReadFile(path)
			if err != nil {
				lastErr = err
				continue
			}
			s := strings.TrimSpace(string(b))
			if s == "" {
				continue
			}
			return s, nil
		}
	}

	s, err := prompt.ReadFile(embeddedName)
	if err == nil && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s), nil
	}

	if lastErr == nil {
		lastErr = os.ErrNotExist
	}
	return "", fmt.Errorf("read prompt failed: %w (searched: %s)", lastErr, strings.Join(searched, ", "))
}
