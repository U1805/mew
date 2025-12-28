package main

import (
	"log"

	"mew/plugins/twitter-fetcher/internal/engine"
)

func main() {
	if err := engine.RunService(); err != nil {
		log.Fatal(err)
	}
}
