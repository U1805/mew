# 第一阶段：使用 alpine/git 拉取代码
FROM alpine/git:2.49.1 AS builder
WORKDIR /src

RUN git clone --depth 1 https://github.com/CassiopeiaCode/b4u2cc.git .

# 第二阶段：构建最终的 Deno 运行环境
FROM denoland/deno:2.2.7
COPY --from=builder /src /src

# 设置工作目录
WORKDIR /src/deno-proxy

# 启动命令
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "src/main.ts"]
