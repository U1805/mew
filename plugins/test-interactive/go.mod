module mew/plugins/test-interactive

go 1.22

require (
	github.com/gorilla/websocket v1.5.3
	mew/plugins/sdk v0.0.0
)

require github.com/joho/godotenv v1.5.1 // indirect

replace mew/plugins/sdk => ../sdk
