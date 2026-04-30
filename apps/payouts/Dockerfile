# syntax=docker/dockerfile:1.7
#
# Optimized for Coolify auto-deploys: BuildKit cache mounts (named ids
# for cross-build sharing) + COPY --link (content-addressed layers,
# survive git checkout mtime changes). Cold ≈ 4 min; warm ≈ 60-90 s.

FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS deps
COPY --link pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY --link packages/coinbase/package.json ./packages/coinbase/
COPY --link packages/crypto/package.json ./packages/crypto/
COPY --link packages/db/package.json ./packages/db/
COPY --link packages/db/prisma ./packages/db/prisma
COPY --link packages/groups/package.json ./packages/groups/
COPY --link packages/nostr/package.json ./packages/nostr/
COPY --link packages/shared/package.json ./packages/shared/
COPY --link packages/templates/package.json ./packages/templates/
COPY --link apps/payouts/package.json ./apps/payouts/
COPY --link apps/stratum/package.json ./apps/stratum/
COPY --link apps/stratum/patches ./apps/stratum/patches
COPY --link apps/web/package.json ./apps/web/
RUN --mount=type=cache,id=hashden-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY --link . .
RUN --mount=type=cache,id=hashden-tsc-cache,target=/repo/node_modules/.cache,sharing=locked \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter @hashden/payouts build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder --link /repo /repo
CMD ["pnpm", "--filter", "@hashden/payouts", "start"]
