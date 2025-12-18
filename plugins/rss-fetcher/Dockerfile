FROM golang:1.22-alpine AS build

WORKDIR /src/plugins/rss-fetcher

COPY plugins/rss-fetcher/go.mod ./
COPY plugins/rss-fetcher/go.sum ./
COPY plugins/sdk/go.mod ../sdk/go.mod
COPY plugins/sdk/go.sum ../sdk/go.sum
COPY plugins/rss-fetcher/*.go ./
COPY plugins/sdk/*.go ../sdk/

RUN go mod download
RUN go build -o /out/mew-rss-fetcher-bot .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates

COPY --from=build /out/mew-rss-fetcher-bot /usr/local/bin/mew-rss-fetcher-bot

ENTRYPOINT ["mew-rss-fetcher-bot"]
