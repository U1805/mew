module mew/plugins/test

go 1.24.0

toolchain go1.25.5

require mew/plugins/sdk v0.0.0

require (
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	golang.org/x/net v0.48.0 // indirect
)

replace mew/plugins/sdk => ../../sdk
