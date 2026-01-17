package main

import (
	"log"

	"mew/plugins/internal/agents/jpdict-agent/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
