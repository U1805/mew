# CLAUDE.md

## Project Overview
Mew is a private messaging platform and digital second brain.
- **Core Concept**: Private Discord-like IM platform + Bot Ecosystem.
- **Frontend**: React, Tailwind CSS, Iconify, Zustand, TipTap.
- **Backend**: Node.js, Socket.io, Fastify/Express, MongoDB, MinIO.
- **Bots**: Golang (Crawlers), Python (AI/LLM).

## Build & Run Commands
- **Install Dependencies**: `npm install` (Root), `cd client && npm install`, `cd server && npm install`
- **Start Dev Server (Backend)**: `npm run dev:server` (Port 3000)
- **Start Dev Client (Frontend)**: `npm run dev:client` (Port 5173)
- **Run Database**: `docker compose up -d mongo minio redis`
- **Lint**: `npm run lint`
- **Test**: `npm test`

## Code Style Guidelines
- **Language**: TypeScript (Strict mode enabled).
- **Formatting**: Prettier default settings. 2 spaces indentation.
- **Frontend**: 
  - Functional components with Hooks.
  - Tailwind for styling (no CSS-in-JS libraries unless necessary).
  - Use `zod` for schema validation.
- **Backend**:
  - Controller-Service-Repository pattern.
  - Async/Await for all IO operations.
  - Error handling via global error middleware.
- **Naming**: 
  - `camelCase` for variables/functions.
  - `PascalCase` for React components and Classes.
  - `UPPER_CASE` for constants.

## Architecture Notes
- **Message Protocol**: Uses MIME-type style `type` field (e.g., `app/x-rss-card`) to determine rendering.
- **Data Storage**: 
  - Messages -> MongoDB
  - Files -> MinIO
  - Vector Memories -> Qdrant (accessed via Python Bot)
- **Communication**: 
  - Real-time -> Socket.io
  - Bot Push -> Webhook / Gateway