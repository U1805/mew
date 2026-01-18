# syntax=docker/dockerfile:1.7

ARG GO_IMAGE=golang:1.25.5-alpine
ARG RUNTIME_IMAGE=alpine:3.20
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS build

WORKDIR /src

COPY plugins ./plugins

ARG GOPROXY=https://mirrors.aliyun.com/goproxy/,direct
ARG TARGETOS
ARG TARGETARCH

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eux; \
    mkdir -p /out; \
    ( \
      cd /src/plugins; \
      CGO_ENABLED=0 go env -w GO111MODULE=on; \
      CGO_ENABLED=0 go env -w GOPROXY="$GOPROXY"; \
      CGO_ENABLED=0 go mod download; \
      for d in ./cmd/fetchers/* ./cmd/agents/*; do \
        if [ ! -d "$d" ]; then \
          continue; \
        fi; \
        name="$(basename "$d")"; \
        GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" CGO_ENABLED=0 go build -o "/out/mew-${name}-bot" "$d"; \
      done; \
    )

FROM --platform=$TARGETPLATFORM ${RUNTIME_IMAGE}

RUN apk add --no-cache ca-certificates tini libwebp-tools

ENV HOME=/root

COPY --from=build /out/ /usr/local/bin/
COPY docker/plugins/entrypoint.sh /usr/local/bin/mew-bot-entrypoint

RUN chmod +x /usr/local/bin/mew-bot-entrypoint

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/mew-bot-entrypoint"]

