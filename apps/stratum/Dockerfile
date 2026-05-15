# syntax=docker/dockerfile:1.7
#
# Per-app monorepo build via `turbo prune --docker`. Pinned to Node 20
# because @nestjs/schedule@3.0.4 (upstream public-pool dep) calls
# util.isString, which Node 22+ removed.

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS pruner
RUN npm install -g turbo@2.5.4
COPY --link . .
RUN turbo prune public-pool --docker

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pruner --link /repo/out/json/ ./
# Workspace postinstalls need these files at install time:
#   @hashden/db  → packages/db/prisma   (prisma generate)
#   public-pool  → apps/stratum/patches (patch-package)
COPY --from=pruner --link /repo/out/full/packages/db/prisma ./packages/db/prisma
COPY --from=pruner --link /repo/out/full/apps/stratum/patches ./apps/stratum/patches
RUN --mount=type=cache,id=hashden-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner --link /repo/out/full/ ./
RUN --mount=type=cache,id=hashden-tsc-cache,target=/repo/node_modules/.cache \
    --mount=type=cache,id=hashden-turbo-cache,target=/repo/.turbo \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter public-pool build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder --link /repo /repo
EXPOSE 3333 3334
CMD ["pnpm", "--filter", "public-pool", "start:prod"]
