module mew/plugins/pornhub-fetcher

go 1.24.0

toolchain go1.25.5

require (
	github.com/PuerkitoBio/goquery v1.9.1
	mew/plugins/sdk v0.0.0
)

replace mew/plugins/sdk => ../../sdk

require (
	github.com/andybalholm/cascadia v1.3.2 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	golang.org/x/net v0.48.0 // indirect
)
