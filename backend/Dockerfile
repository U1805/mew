FROM node:20-slim

WORKDIR /app

# Ensure devDependencies (tsc, etc.) are installed for the build step.
ENV NODE_ENV=development

# Install deps (workspace)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json

RUN corepack enable && pnpm install --frozen-lockfile --prod=false

# Build backend
COPY backend ./backend
RUN pnpm --filter backend build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm","--filter","backend","start"]

