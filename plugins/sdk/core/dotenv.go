package core

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/joho/godotenv"
)

// LoadDotEnv tries to load env vars from:
// - .env.local, .env (cwd)
// - .env.local, .env (caller file dir)
// - .env.local, .env (caller file dir parent, e.g. plugins/fetchers/)
// - .env.local, .env (caller file dir grandparent, e.g. plugins/)
//
// It only sets vars that are not already set, matching godotenv's behavior.
func LoadDotEnv(logPrefix string) {
	LoadDotEnvFromCaller(logPrefix, 1)
}

// LoadDotEnvFromCaller is the same as LoadDotEnv, but allows specifying how many
// stack frames to skip when locating the caller file.
func LoadDotEnvFromCaller(logPrefix string, callerSkip int) {
	if IsDotEnvDisabled() {
		return
	}

	paths := []string{".env.local", ".env"} // cwd

	if _, file, _, ok := runtime.Caller(callerSkip); ok {
		// Walk up from the caller file directory, so running from any subdir
		// (e.g. plugins/fetchers/<service>/internal/app) still finds:
		// - plugin root
		// - plugin group (plugins/fetchers, plugins/agents)
		// - plugins/
		// - repo root (common in local dev)
		dir := filepath.Dir(file)
		for d := dir; ; {
			paths = append(paths, filepath.Join(d, ".env.local"), filepath.Join(d, ".env"))
			parent := filepath.Dir(d)
			if parent == d {
				break
			}
			d = parent
		}
	}

	seen := make(map[string]struct{}, len(paths))
	uniq := make([]string, 0, len(paths))
	for _, p := range paths {
		p = filepath.Clean(p)
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		uniq = append(uniq, p)
	}
	paths = uniq

	for _, p := range paths {
		if err := godotenv.Load(p); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			log.Fatalf("%s failed to load %s: %v", logPrefix, p, err)
		} else {
			log.Printf("%s loaded env from %s", logPrefix, p)
		}
	}
}

func IsDotEnvDisabled() bool {
	v := strings.TrimSpace(os.Getenv("MEW_DOTENV"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "0", "false", "off", "no":
		return true
	default:
		return false
	}
}
