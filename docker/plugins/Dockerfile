FROM golang:1.25.5-alpine AS build

WORKDIR /src

COPY plugins ./plugins

ARG GOPROXY=https://mirrors.aliyun.com/goproxy/,direct

RUN set -eux; \
    mkdir -p /out; \
    for d in /src/plugins/fetchers/* /src/plugins/agents/*; do \
      if [ ! -d "$d" ]; then \
        continue; \
      fi; \
      name="$(basename "$d")"; \
      if [ ! -f "$d/go.mod" ]; then \
        continue; \
      fi; \
      ( \
        cd "$d"; \
        CGO_ENABLED=0 go env -w GO111MODULE=on; \
        CGO_ENABLED=0 go env -w GOPROXY="$GOPROXY"; \
        CGO_ENABLED=0 go mod download; \
        pkg="."; \
        if [ -d "./cmd" ]; then \
          if [ -d "./cmd/${name}" ]; then \
            pkg="./cmd/${name}"; \
          else \
            # If there's exactly one cmd/* directory, use it as the main package. \
            cmd_pkg=""; \
            for c in ./cmd/*; do \
              if [ -d "$c" ]; then \
                if [ -n "$cmd_pkg" ]; then \
                  cmd_pkg=""; \
                  break; \
                fi; \
                cmd_pkg="$c"; \
              fi; \
            done; \
            if [ -n "$cmd_pkg" ]; then \
              pkg="$cmd_pkg"; \
            fi; \
          fi; \
        fi; \
        CGO_ENABLED=0 go build -o "/out/mew-${name}-bot" "$pkg"; \
      ); \
    done

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini

ENV HOME=/root

COPY --from=build /out/ /usr/local/bin/
COPY docker/plugins/entrypoint.sh /usr/local/bin/mew-bot-entrypoint

RUN chmod +x /usr/local/bin/mew-bot-entrypoint

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/mew-bot-entrypoint"]

