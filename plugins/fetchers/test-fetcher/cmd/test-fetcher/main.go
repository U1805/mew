package main

import (
	"log"

	"mew/plugins/test/internal/engine"
)

func main() {
	if err := engine.RunService(); err != nil {
		log.Fatal(err)
	}
}
