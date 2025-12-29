package main

import (
	"log"

	"mew/plugins/jpdict-agent/internal/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
