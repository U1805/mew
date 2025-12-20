# Mew

Welcome to Mew, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

This project is a monorepo containing the frontend, backend, and bot services.

## Documentation

Project docs live in `website/docs` (Docusaurus).

- Local preview: `pnpm dev:website`
- Build: `pnpm build:website`

## Getting Started

## Docker (recommended)

### Local build

From the repo root:

```bash
docker compose up --build
```

- Frontend: `http://localhost:11451`
- Backend: `http://localhost:3000`

Common env overrides (`docker-compose.env`):

- `JWT_SECRET`
- `MEW_ADMIN_SECRET`

> Generate SECRET with `openssl rand -base64 32`

```bash
docker compose --env-file docker-compose.env up --build
```

### GHCR

This repo ships a `docker-compose.ghcr.yml` that pulls prebuilt images from GHCR.

```bash
docker compose -f docker-compose.ghcr.yml up -d
```
