package core

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// PreviewString trims s and returns at most maxRunes runes, appending an ellipsis when truncated.
func PreviewString(s string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "…"
}

// CandidateDataFilePaths returns a de-duplicated list of paths to look for a data file.
//
// Search order:
//  1. current working directory
//  2. executable directory
//  3. caller source file directory (outside plugins/sdk)
func CandidateDataFilePaths(filename string) []string {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return nil
	}

	var out []string

	if cwd, err := os.Getwd(); err == nil && strings.TrimSpace(cwd) != "" {
		out = append(out, filepath.Join(cwd, filename))
	}

	if exe, err := os.Executable(); err == nil && strings.TrimSpace(exe) != "" {
		out = append(out, filepath.Join(filepath.Dir(exe), filename))
	}

	if _, file, _, ok := runtime.Caller(nonSDKCallerSkip(2)); ok && strings.TrimSpace(file) != "" {
		out = append(out, filepath.Join(filepath.Dir(file), filename))
	}

	seen := map[string]struct{}{}
	uniq := make([]string, 0, len(out))
	for _, p := range out {
		p = filepath.Clean(p)
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		uniq = append(uniq, p)
	}
	return uniq
}
