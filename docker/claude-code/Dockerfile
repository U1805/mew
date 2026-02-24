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
        python3-venv \
        python3-pip \
        ripgrep \
        ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN if ! command -v npx >/dev/null 2>&1; then npm install -g npx; fi \
    && npm install -g @anthropic-ai/claude-code

RUN mkdir -p /home/node/workspace /home/node/.claude /opt/cc-proxy \
    && chown -R node:node /home/node/workspace /home/node/.claude /opt/cc-proxy

ENV HOME=/home/node
ENV VIRTUAL_ENV=/home/node/.venv
ENV PATH="/home/node/.venv/bin:${PATH}"
WORKDIR /home/node/workspace

COPY --chown=node:node plugins/internal/agents/claudecode-agent/claude/server.py /opt/cc-proxy/server.py
COPY --chown=node:node plugins/internal/agents/claudecode-agent/claude/.claude.json /home/node/.claude.json
COPY --chown=node:node plugins/internal/agents/claudecode-agent/claude/settings.json /home/node/.claude/settings.json
COPY --chown=node:node plugins/internal/agents/claudecode-agent/claude/CLAUDE.md /home/node/.claude/CLAUDE.md
COPY --chown=node:node plugins/internal/agents/claudecode-agent/claude/skills /home/node/.claude/skills

EXPOSE 3457

USER node

RUN python -m venv "$VIRTUAL_ENV" \
    && pip install --no-cache-dir --upgrade pip

CMD ["python", "/opt/cc-proxy/server.py"]
