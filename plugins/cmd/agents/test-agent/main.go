package main

import (
	"log"

	"mew/plugins/internal/agents/test-agent/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
