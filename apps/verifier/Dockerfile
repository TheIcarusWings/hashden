# syntax=docker/dockerfile:1.7
#
# Standalone build: apps/verifier has NO workspace deps (only bitcoinjs-lib +
# tiny-secp256k1), so it builds with plain npm — no turbo prune / pnpm workspace
# needed. The result is a tiny image miners can `docker run` with no checkout.
#
# Build from the repo root:  docker build -f apps/verifier/Dockerfile .

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Insurance for any native postinstall (tiny-secp256k1 ships WASM, so usually
# none) — kept to the build stage only.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY apps/verifier/package.json apps/verifier/tsconfig.json ./
COPY apps/verifier/src ./src
RUN npm install --no-audit --no-fund
RUN npx tsc -p tsconfig.json
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Flags are passed to the CLI:
#   docker run --rm -p 3333:3333 <image> --den ... --address ... --rule solo --listen 0.0.0.0:3333
ENTRYPOINT ["node", "dist/cli.js"]
