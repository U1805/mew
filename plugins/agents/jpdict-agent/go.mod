module mew/plugins/jpdict-agent

go 1.24.0

toolchain go1.25.5

require (
	github.com/openai/openai-go/v3 v3.15.0
	mew/plugins/sdk v0.0.0
)

require (
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	github.com/tidwall/gjson v1.18.0 // indirect
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	github.com/tidwall/sjson v1.2.5 // indirect
	golang.org/x/net v0.48.0 // indirect
)

replace mew/plugins/sdk => ../../sdk
