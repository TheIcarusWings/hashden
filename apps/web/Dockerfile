# syntax=docker/dockerfile:1.7
#
# Per-app monorepo build via `turbo prune --docker`. The pruner scopes
# the workspace to @hashden/web + its workspace deps, so commits that
# only touch apps/stratum or apps/payouts don't invalidate this image's
# deps/builder layers (BuildKit hits the cache on byte-identical
# `out/json/` and `out/full/` outputs via COPY --link).
#
# Runtime is Next.js standalone (~200 MB).

FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS pruner
RUN npm install -g turbo@2.5.4
COPY --link . .
RUN turbo prune @hashden/web --docker

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pruner --link /repo/out/json/ ./
# Schema is read by @hashden/db's `prisma generate` postinstall.
COPY --from=pruner --link /repo/out/full/packages/db/prisma ./packages/db/prisma
RUN --mount=type=cache,id=hashden-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
ARG NEXT_PUBLIC_HASHDEN_API_URL
ARG NEXT_PUBLIC_HASHDEN_STRATUM_URL
ARG NEXT_PUBLIC_HASHDEN_RELAYS
ARG NEXT_PUBLIC_APP_URL
# NEXT_PUBLIC_* are inlined at build time, so the donations flag is a build arg.
# The BTCPAY_* secrets are server-only and read at RUNTIME — they are passed
# via the container environment (see compose), never baked into the image.
ARG NEXT_PUBLIC_DONATIONS_ENABLED
ARG NEXT_PUBLIC_ZAP_NPUB
ENV NEXT_PUBLIC_HASHDEN_API_URL=$NEXT_PUBLIC_HASHDEN_API_URL \
    NEXT_PUBLIC_HASHDEN_STRATUM_URL=$NEXT_PUBLIC_HASHDEN_STRATUM_URL \
    NEXT_PUBLIC_HASHDEN_RELAYS=$NEXT_PUBLIC_HASHDEN_RELAYS \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_DONATIONS_ENABLED=$NEXT_PUBLIC_DONATIONS_ENABLED \
    NEXT_PUBLIC_ZAP_NPUB=$NEXT_PUBLIC_ZAP_NPUB
COPY --from=pruner --link /repo/out/full/ ./
RUN --mount=type=cache,id=hashden-next-cache,target=/repo/apps/web/.next/cache \
    --mount=type=cache,id=hashden-tsc-cache,target=/repo/node_modules/.cache \
    --mount=type=cache,id=hashden-turbo-cache,target=/repo/.turbo \
    pnpm -r --filter './packages/*' build && \
    pnpm --filter @hashden/web build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --link /repo/apps/web/.next/standalone ./
COPY --from=builder --link /repo/apps/web/.next/static ./apps/web/.next/static
# Next's standalone output does NOT bundle public/, so copy it explicitly —
# without this, every static asset (e.g. /.well-known/security.txt) 404s.
COPY --from=builder --link /repo/apps/web/public ./apps/web/public
# Build provenance, baked so /verify and /api/version can report exactly which
# commit produced this running bundle (matchable against the public repo + the
# signed GHCR image). Passed by .github/workflows/release-web.yml. Declared
# last so a new SHA only invalidates this tiny final layer, not the build.
# Defaults keep non-pipeline builds (local, current Coolify) working — they
# just report "unknown".
ARG HASHDEN_BUILD_SHA=unknown
ARG HASHDEN_BUILD_REF=unknown
ARG HASHDEN_BUILD_TIME=unknown
ENV HASHDEN_BUILD_SHA=$HASHDEN_BUILD_SHA \
    HASHDEN_BUILD_REF=$HASHDEN_BUILD_REF \
    HASHDEN_BUILD_TIME=$HASHDEN_BUILD_TIME
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
