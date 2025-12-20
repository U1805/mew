# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
ENV NODE_ENV=development

# Install only the backend dependency graph (dev deps included for `tsc`)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
# Needed so pnpm can resolve the workspace (but we don't install their deps)
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json
RUN pnpm install --frozen-lockfile --filter backend... --prod=false

COPY backend ./backend
RUN pnpm --filter backend build

FROM base AS prod-deps
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json
RUN pnpm install --frozen-lockfile --filter backend... --prod

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/package.json ./backend/package.json

EXPOSE 3000
CMD ["node", "backend/dist/server.js"]

