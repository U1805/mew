FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        curl \
        git \
        jq \
        less \
        procps \
        python3 \
        python3-pip \
        ripgrep \
        ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace

COPY plugins/internal/agents/claudecode-agent/claude_code_proxy/server.py /opt/mew/claudecode-agent/server.py

EXPOSE 3457

CMD ["python", "/opt/mew/claudecode-agent/server.py"]
