# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
ENV NODE_ENV=development

# Install only the server dependency graph (dev deps included for `tsc`)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
# Needed so pnpm can resolve the workspace (but we don't install their deps)
COPY client/package.json client/package.json
COPY website/package.json website/package.json
RUN pnpm install --frozen-lockfile --filter server... --prod=false

COPY server ./server
RUN pnpm --filter server build

FROM base AS prod-deps
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY website/package.json website/package.json
RUN pnpm install --frozen-lockfile --filter server... --prod

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY server/package.json ./server/package.json

EXPOSE 3000
CMD ["node", "server/dist/server.js"]

