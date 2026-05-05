FROM node:20-alpine AS base
RUN corepack enable pnpm

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build client
FROM deps AS client-build
COPY packages/client/ packages/client/
RUN pnpm -F client build

# Build server
FROM deps AS server-build
COPY packages/server/ packages/server/
RUN pnpm -F server build

# Production image
FROM node:20-alpine
WORKDIR /app

COPY --from=server-build /app/packages/server/dist ./server/dist
COPY --from=server-build /app/packages/server/node_modules ./server/node_modules
COPY --from=client-build /app/packages/client/dist ./client/dist

ENV NODE_ENV=production
ENV CLIENT_DIST=/app/client/dist

EXPOSE 5000

CMD ["node", "server/dist/index.js"]
