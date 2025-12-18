FROM golang:1.22-alpine AS build

WORKDIR /src/plugins/test

COPY plugins/test/go.mod ./
COPY plugins/test/*.go ./

RUN go build -o /out/mew-test-bot .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates

COPY --from=build /out/mew-test-bot /usr/local/bin/mew-test-bot

ENTRYPOINT ["mew-test-bot"]

