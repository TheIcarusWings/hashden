FROM node:24-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
COPY . .
ARG NEXT_PUBLIC_HASHDEN_API_URL
ARG NEXT_PUBLIC_HASHDEN_STRATUM_URL
ARG NEXT_PUBLIC_HASHDEN_RELAYS
ENV NEXT_PUBLIC_HASHDEN_API_URL=$NEXT_PUBLIC_HASHDEN_API_URL \
    NEXT_PUBLIC_HASHDEN_STRATUM_URL=$NEXT_PUBLIC_HASHDEN_STRATUM_URL \
    NEXT_PUBLIC_HASHDEN_RELAYS=$NEXT_PUBLIC_HASHDEN_RELAYS \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hashden/web build

FROM node:24-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo /repo
EXPOSE 3000
CMD ["pnpm", "--filter", "@hashden/web", "start"]
