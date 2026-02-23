package main

import (
	"log"

	"mew/plugins/internal/agents/claudecode-agent/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
