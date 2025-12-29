package main

import (
	"log"

	"mew/plugins/instagram-fetcher/internal/engine"
)

func main() {
	if err := engine.RunService(); err != nil {
		log.Fatal(err)
	}
}
