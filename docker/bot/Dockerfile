FROM golang:1.22-alpine AS build

WORKDIR /src

COPY plugins ./plugins

RUN set -eux; \
    mkdir -p /out; \
    for d in /src/plugins/*; do \
      name="$(basename "$d")"; \
      if [ "$name" = "sdk" ]; then \
        continue; \
      fi; \
      if [ ! -f "$d/go.mod" ]; then \
        continue; \
      fi; \
      ( \
        cd "$d"; \
        CGO_ENABLED=0 go env -w GO111MODULE=on; \
        CGO_ENABLED=0 go env -w GOPROXY=https://mirrors.aliyun.com/goproxy/,direct; \
        CGO_ENABLED=0 go mod download; \
        CGO_ENABLED=0 go build -o "/out/mew-${name}-bot" .; \
      ); \
    done

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini

COPY --from=build /out/ /usr/local/bin/
COPY docker/bot/entrypoint.sh /usr/local/bin/mew-bot-entrypoint

RUN chmod +x /usr/local/bin/mew-bot-entrypoint

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/mew-bot-entrypoint"]

