# Mew

Welcome to Mew, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

This project is a monorepo containing the client, server, and plugin services.

## Documentation

Project docs live in `website/docs` (Docusaurus).

- Local preview: `pnpm dev:website`
- Build: `pnpm build:website`

## Getting Started

### Docker (recommended)

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
docker compose --env-file docker-compose.env up --build
```

Endpoints (default `docker-compose.yml`):

- Client: `http://localhost:80`
- Server: `http://localhost:3000/api`
- MongoDB: `mongodb://localhost:27017`
- Garage (S3 API): `http://localhost:3900`
- Garage (Public Web): `http://localhost:3902`

### GHCR

This repo ships a `docker-compose.ghcr.yml` that pulls prebuilt images from GHCR.

```bash
docker compose -f docker-compose.ghcr.yml up -d
```
