module mew/plugins/bilibili-fetcher

go 1.24.0

toolchain go1.25.5

require mew/plugins/sdk v0.0.0

replace mew/plugins/sdk => ../../sdk

require (
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	golang.org/x/net v0.48.0 // indirect
)
