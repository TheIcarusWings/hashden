# syntax=docker/dockerfile:1.7
#
# Build optimization: split COPY for layer caching + BuildKit cache mount
# for pnpm store. Cold build ≈ 5 min; warm build (deps unchanged) ≈ 90s.
# Pinned to Node 20 because @nestjs/schedule@3.0.4 (upstream public-pool
# dep) calls util.isString which Node 22+ removed.

FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/coinbase/package.json ./packages/coinbase/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma ./packages/db/prisma
COPY packages/groups/package.json ./packages/groups/
COPY packages/nostr/package.json ./packages/nostr/
COPY packages/shared/package.json ./packages/shared/
COPY packages/templates/package.json ./packages/templates/
COPY apps/payouts/package.json ./apps/payouts/
COPY apps/stratum/package.json ./apps/stratum/
COPY apps/stratum/patches ./apps/stratum/patches
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN --mount=type=cache,target=/repo/node_modules/.cache \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter public-pool build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo /repo
EXPOSE 3333 3334
CMD ["pnpm", "--filter", "public-pool", "start:prod"]
