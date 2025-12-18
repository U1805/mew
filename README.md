# Mew

Welcome to Mew, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

This project is a monorepo containing the frontend, backend, and bot services.

## Documentation

For detailed information about the project's vision, architecture, and implementation plan, please refer to the documents in the `/docs` directory:

- **[Project Vision](./docs/PROJECT.md):** The core vision and goals of the project.
- **[Implementation Plan](./docs/IMPLEMENTATION_PLAN.md):** Detailed technical specifications for the IM platform.

## Getting Started

For instructions on how to set up and run the project for development, please see the [Development Guide](./docs/DEVELOPMENT_GUIDE.md).

## Docker (recommended)

From the repo root:

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000`

Common env overrides (put into a local `.env` next to `docker-compose.yml`):

- `JWT_SECRET`
- `MEW_ADMIN_SECRET`
- `VITE_API_BASE_URL` (default: `/api`)
