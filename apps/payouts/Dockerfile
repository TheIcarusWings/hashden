FROM node:24-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config ca-certificates curl cmake \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hashden/payouts build

FROM node:24-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo /repo
CMD ["pnpm", "--filter", "@hashden/payouts", "start"]
