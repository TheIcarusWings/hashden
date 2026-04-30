# syntax=docker/dockerfile:1.7
#
# Build optimization: BuildKit cache mounts (named ids) + COPY --link.

FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

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
ARG NEXT_PUBLIC_HASHDEN_API_URL
ARG NEXT_PUBLIC_HASHDEN_STRATUM_URL
ARG NEXT_PUBLIC_HASHDEN_RELAYS
ENV NEXT_PUBLIC_HASHDEN_API_URL=$NEXT_PUBLIC_HASHDEN_API_URL \
    NEXT_PUBLIC_HASHDEN_STRATUM_URL=$NEXT_PUBLIC_HASHDEN_STRATUM_URL \
    NEXT_PUBLIC_HASHDEN_RELAYS=$NEXT_PUBLIC_HASHDEN_RELAYS
COPY --link . .
RUN --mount=type=cache,id=hashden-next-cache,target=/repo/apps/web/.next/cache,sharing=locked \
    --mount=type=cache,id=hashden-tsc-cache,target=/repo/node_modules/.cache,sharing=locked \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter @hashden/web build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --link /repo /repo
EXPOSE 3000
CMD ["pnpm", "--filter", "@hashden/web", "start"]
