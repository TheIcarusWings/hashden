# syntax=docker/dockerfile:1.7
#
# Build optimization: split COPY for layer caching + BuildKit cache mount
# for pnpm store. Cold build ≈ 4 min; warm build (deps unchanged) ≈ 1 min.

FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

# deps: copy only the metadata needed to resolve the dep graph + run
# postinstall hooks. Cached when package.json/lockfiles don't change.
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

# builder: compile workspace packages + the app.
FROM deps AS builder
COPY . .
RUN --mount=type=cache,target=/repo/node_modules/.cache \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter @hashden/payouts build

# runtime: minimal image carrying the built workspace.
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo /repo
CMD ["pnpm", "--filter", "@hashden/payouts", "start"]
