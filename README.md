# Mew

Welcome to Mew, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

This project is a monorepo containing the client, server, and plugin services.

## Getting Started

From the repo root:

```bash
vim docker/garage/garage.toml
```

Before starting, update the dev-only secrets/tokens `rpc_secret`, `admin_token`, `metrics_token` for any non-local deployment.
> - RPC secret: `openssl rand -hex 32`
> - Tokens: `openssl rand -base64 32`

```bash
vim docker-compose.env
```

- `JWT_SECRET`
- `MEW_ADMIN_SECRET`
- `MEW_CORS_ORIGINS` (dev default: `*`; production should be explicit)
- `MEW_PLUGINS` (default: `test-fetcher,test-agent`)

> Generate secrets with `openssl rand -base64 32`

```bash
# create network
docker network inspect mew_network >/dev/null 2>&1 || docker network create mew_network
```

### Docker

```bash
# basic app
docker compose \
  --env-file docker-compose.env \
  up -d --build

# full app with claudecode-agent
docker compose \
  --env-file docker-compose.env \
  -f docker-compose.yml \
  -f docker-compose.cc.yml \
  up -d --build
```

Endpoints (default `docker-compose.yml`):

- `http://localhost:151`

### GHCR

This repo ships a `docker-compose.ghcr.yml` override that pulls prebuilt images from GHCR.

```bash
docker compose \
  --env-file docker-compose.env \
  -f docker-compose.yml \
  -f docker-compose.ghcr.yml \
  up -d

docker compose \
  --env-file docker-compose.env \
  -f docker-compose.yml \
  -f docker-compose.ghcr.yml \
  -f docker-compose.cc.yml \
  -f docker-compose.cc.ghcr.yml \
  up -d
```
