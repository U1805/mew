package runtime

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
// - .env.local, .env (caller file dir parent, e.g. plugins/internal/fetchers/)
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
		// Special-case: centralized entrypoints under plugins/cmd/(fetchers|agents)/<serviceType>.go
		// should still discover env files from the plugin module root:
		// - plugins/internal/<group>/<serviceType> (plugin root)
		// - plugins/internal/<group> (plugin group)
		dir := filepath.Dir(file) // .../plugins/cmd/<group>/<serviceType> (or .../<group> for legacy single-file)
		// New layout: plugins/cmd/(fetchers|agents)/<serviceType>/main.go
		{
			parent := filepath.Dir(dir)         // .../plugins/cmd/<group>
			grand := filepath.Dir(parent)       // .../plugins/cmd
			group := filepath.Base(parent)      // <group>
			serviceType := filepath.Base(dir)   // <serviceType>
			if (group == "fetchers" || group == "agents") && filepath.Base(grand) == "cmd" && strings.TrimSpace(serviceType) != "" {
				pluginsDir := filepath.Dir(grand) // .../plugins
				pluginDir := filepath.Join(pluginsDir, "internal", group, serviceType)
				paths = append(paths,
					filepath.Join(pluginDir, ".env.local"),
					filepath.Join(pluginDir, ".env"),
					filepath.Join(filepath.Dir(pluginDir), ".env.local"),
					filepath.Join(filepath.Dir(pluginDir), ".env"),
				)
			}
		}
		// Legacy layout: plugins/cmd/(fetchers|agents)/<serviceType>.go
		{
			group := filepath.Base(dir) // fetchers|agents
			if (group == "fetchers" || group == "agents") && filepath.Base(filepath.Dir(dir)) == "cmd" {
				pluginsDir := filepath.Dir(filepath.Dir(dir))
				serviceType := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
				if strings.TrimSpace(serviceType) != "" {
					pluginDir := filepath.Join(pluginsDir, "internal", group, serviceType)
					paths = append(paths,
						filepath.Join(pluginDir, ".env.local"),
						filepath.Join(pluginDir, ".env"),
						filepath.Join(filepath.Dir(pluginDir), ".env.local"),
						filepath.Join(filepath.Dir(pluginDir), ".env"),
					)
				}
			}
		}

		// Walk up from the caller file directory, so running from any subdir
		// (e.g. plugins/internal/fetchers/<service>/internal/app) still finds:
		// - plugin root
		// - plugin group (plugins/internal/fetchers, plugins/internal/agents)
		// - plugins/
		// - repo root (common in local dev)
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
