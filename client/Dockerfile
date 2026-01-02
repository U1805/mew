# Run the frontend build on the build machine to avoid QEMU emulation issues in
# multi-arch builds (static assets are architecture-independent).
ARG NODE_IMAGE=node:20-slim
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

WORKDIR /app

# Ensure devDependencies (tsc, vite, etc.) are installed for the build step.
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY website/package.json website/package.json

RUN corepack enable && pnpm install --frozen-lockfile --prod=false

COPY client ./client

RUN pnpm --filter client build

FROM --platform=$TARGETPLATFORM ${NGINX_IMAGE}

COPY docker/client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
