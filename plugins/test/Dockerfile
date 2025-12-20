FROM golang:1.22-alpine AS build

WORKDIR /src/plugins/test

COPY test/go.mod ./
COPY test/go.sum ./
COPY sdk/go.mod ../sdk/go.mod
COPY sdk/go.sum ../sdk/go.sum
COPY test/*.go ./
COPY sdk/*.go ../sdk/

# RUN go env -w GO111MODULE=on
# RUN go env -w GOPROXY=https://mirrors.aliyun.com/goproxy/,direct
RUN go mod download
RUN go build -o /out/mew-test-bot .

FROM alpine:3.20
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
# RUN sed -i 's/#http/http/g' /etc/apk/repositories
# RUN apk update
RUN apk add --no-cache ca-certificates

COPY --from=build /out/mew-test-bot /usr/local/bin/mew-test-bot

ENTRYPOINT ["mew-test-bot"]
