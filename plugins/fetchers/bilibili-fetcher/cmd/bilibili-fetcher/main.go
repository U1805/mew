package main

import (
	"log"

	"mew/plugins/bilibili-fetcher/internal/engine"
)

func main() {
	if err := engine.RunService(); err != nil {
		log.Fatal(err)
	}
}
