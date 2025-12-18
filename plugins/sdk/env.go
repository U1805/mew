package sdk

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
// - .env.local, .env (caller file dir parent, e.g. plugins/)
//
// It only sets vars that are not already set, matching godotenv's behavior.
func LoadDotEnv(logPrefix string) {
	if IsDotEnvDisabled() {
		return
	}

	paths := []string{".env.local", ".env"}

	if _, file, _, ok := runtime.Caller(1); ok {
		dir := filepath.Dir(file)
		paths = append(
			paths,
			filepath.Join(dir, ".env.local"),
			filepath.Join(dir, ".env"),
			filepath.Clean(filepath.Join(dir, "..", ".env.local")),
			filepath.Clean(filepath.Join(dir, "..", ".env")),
		)
	}

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
