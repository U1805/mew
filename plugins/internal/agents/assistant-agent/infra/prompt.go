package infra

import (
	"embed"
	"strings"
)

//go:embed assets/*.txt
var promptContent embed.FS

func ReadFile(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n != "" && !strings.Contains(n, "/") && !strings.Contains(n, "\\") {
		n = "assets/" + n
	}
	b, err := promptContent.ReadFile(n)
	return string(b), err
}
