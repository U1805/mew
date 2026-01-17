package main

import (
	"log"

	"mew/plugins/internal/agents/assistant-agent"
)

func main() {
	if err := agent.Run(); err != nil {
		log.Fatal(err)
	}
}
