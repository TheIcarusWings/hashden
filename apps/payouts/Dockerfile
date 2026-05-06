# syntax=docker/dockerfile:1.7
#
# Per-app monorepo build via `turbo prune --docker`. The pruner scopes
# the workspace to @hashden/payouts + its workspace deps, so commits
# that only touch apps/web or apps/stratum don't invalidate the deps
# or builder cache for this image.

FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS pruner
RUN npm install -g turbo@2.5.4
COPY --link . .
RUN turbo prune @hashden/payouts --docker

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pruner --link /repo/out/json/ ./
COPY --from=pruner --link /repo/out/full/packages/db/prisma ./packages/db/prisma
RUN --mount=type=cache,id=hashden-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner --link /repo/out/full/ ./
RUN --mount=type=cache,id=hashden-tsc-cache,target=/repo/node_modules/.cache \
    --mount=type=cache,id=hashden-turbo-cache,target=/repo/.turbo \
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
