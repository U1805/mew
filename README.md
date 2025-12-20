# Mew

Welcome to Mew, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

This project is a monorepo containing the frontend, backend, and bot services.

## Documentation

Project docs live in `website/docs` (Docusaurus).

- Local preview: `pnpm dev:website`
- Build: `pnpm build:website`

## Getting Started

## Docker (recommended)

From the repo root:

```bash
docker compose up --build
```

- Frontend: `http://localhost:11451`
- Backend: `http://localhost:3000`

Common env overrides (put into a local `.env` next to `docker-compose.yml`):

- `JWT_SECRET`
- `MEW_ADMIN_SECRET`

## Docker (GHCR, no local build)

This repo ships a `docker-compose.ghcr.yml` that pulls prebuilt images from GHCR.

```bash
docker compose -f docker-compose.ghcr.yml up -d
```
