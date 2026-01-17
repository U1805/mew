package main

import (
	"log"

	"mew/plugins/internal/agents/assistant-agent/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
