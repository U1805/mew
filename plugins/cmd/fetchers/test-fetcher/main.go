package main

import (
	"log"

	"mew/plugins/internal/fetchers/test-fetcher/engine"
)

func main() {
	if err := engine.RunService(); err != nil {
		log.Fatal(err)
	}
}
