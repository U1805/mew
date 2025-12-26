module mew/plugins/jpdict-agent

go 1.22

toolchain go1.25.5

require (
	github.com/gorilla/websocket v1.5.3
	mew/plugins/sdk v0.0.0
)

require github.com/joho/godotenv v1.5.1 // indirect

replace mew/plugins/sdk => ../../sdk
