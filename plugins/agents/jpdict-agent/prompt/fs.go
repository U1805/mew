package prompt

import "embed"

//go:embed *.txt
var content embed.FS

func ReadFile(name string) (string, error) {
	b, err := content.ReadFile(name)
	return string(b), err
}

