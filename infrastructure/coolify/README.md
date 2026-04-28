# Hashden — Coolify deploy runbook

Two environments share the same compose file (`docker-compose.yml` in this dir):

| env  | branch | web                 | api                  | stratum (raw TCP)              |
| ---- | ------ | ------------------- | -------------------- | ------------------------------ |
| dev  | `dev`  | dev.hashden.app     | dev-api.hashden.app  | dev-stratum.hashden.app:3333   |
| prod | `main` | hashden.app (apex)  | api.hashden.app      | stratum.hashden.app:3333       |

Plus `www.hashden.app` (CNAME → `hashden.app`) which Traefik 301-redirects to the apex.

Coolify deploys each as its own "Docker Compose" resource pointed at this file with separate env vars. The two stacks share one VPS host; raw-TCP host port `3333` therefore collides. Strategy: deploy dev first, point a Bitaxe at it for end-to-end validation, then deploy prod and shift dev's stratum to a different host port (or shut dev's stratum down) when going live.

## 0. Prerequisites

- DNS records in Spaceship (all → `135.181.144.43` unless noted):
  - A `@` (apex), `api`, `stratum`, `dev`, `dev-api`, `dev-stratum`
  - CNAME `www` → `hashden.app`
- Generated secrets (already stashed in `PRE_FLIGHT.md`, gitignored):
  - `OPERATOR_CREDS_ENC_KEY` (one shared 32-byte hex; identical for stratum + payouts)
  - `PROJECT_NPUB_HEX` / `PROJECT_NSEC_HEX` (nsec only set on payouts)
- Platform cold BTC address — generate from a hardware wallet, save seed phrase to password manager. **Mainnet only**; for dev use any regtest/testnet address you control.
- Bitcoin Knots reachable from VPS via Tailscale (`100.98.39.42:9332`, ZMQ on `:48332` / `:48334`) — verified working per PRE_FLIGHT.

## 1. Coolify project

In Coolify UI (`http://135.181.144.43:8000`):

1. New Project → name `hashden`.
2. Add a **Docker Compose** resource per env:
   - Source: GitHub TheIcarusWings/hashden, branch `dev` (or `main`).
   - Compose file path: `infrastructure/coolify/docker-compose.yml`.
   - Build context resolves correctly because the compose's `build.context` is `../..`.
3. Repeat for the other env.

## 2. Per-environment env vars

Paste into Coolify's "Environment Variables" panel for each Compose resource. Mark all `*_PASSWORD`/`*_KEY`/`*_NSEC*` as secrets so they're masked in the UI.

```
# Domains (used by Traefik labels in compose)
WEB_HOST=hashden.app
API_HOST=api.hashden.app
# Build-time vars (also runtime; baked into the JS bundle)
NEXT_PUBLIC_HASHDEN_API_URL=https://api.hashden.app
NEXT_PUBLIC_HASHDEN_STRATUM_URL=stratum+tcp://stratum.hashden.app:3333
NEXT_PUBLIC_HASHDEN_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
# Datastore (postgres + redis service names resolve inside the compose network)
POSTGRES_USER=hashden
POSTGRES_PASSWORD=<openssl rand -base64 24>
POSTGRES_DB=hashden
DATABASE_URL=postgresql://hashden:<same as POSTGRES_PASSWORD>@postgres:5432/hashden?schema=public
REDIS_URL=redis://redis:6379
# Bitcoin Knots over Tailscale
BITCOIN_RPC_URL=http://100.98.39.42:9332
BITCOIN_RPC_USER=umbrel
BITCOIN_RPC_PASSWORD=spoFXNVvsGBnZSIwwmQnQr8nxNCHYhxJNBQ4bWROTxI=
BITCOIN_ZMQ_HOST=tcp://100.98.39.42:48332     # rawblock; stratum subscribes here
# Hashden secrets (see PRE_FLIGHT.md for the actual values)
OPERATOR_CREDS_ENC_KEY=<32-byte hex>
PROJECT_NPUB_HEX=<hex>
PROJECT_NSEC_HEX=<hex>      # payouts only — but compose passes it; safe because secret is per-env
PLATFORM_BTC_ADDRESS=<cold address>
PLATFORM_FEE_BPS=50
DUST_THRESHOLD_SATS=10000
NETWORK=mainnet             # set to "regtest" for dev-* if you want a regtest stack
POOL_IDENTIFIER=Hashden
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
```

For the dev env, swap the host vars accordingly:

```
WEB_HOST=dev.hashden.app
API_HOST=dev-api.hashden.app
NEXT_PUBLIC_HASHDEN_API_URL=https://dev-api.hashden.app
NEXT_PUBLIC_HASHDEN_STRATUM_URL=stratum+tcp://dev-stratum.hashden.app:3333
```

## 3. First deploy

1. Coolify → Deploy. Watch logs for each service.
2. After postgres is healthy, run the Prisma migration once:
   - Open a one-shot exec into the postgres container OR run from a temporary container with the repo:
     ```
     docker compose -f infrastructure/coolify/docker-compose.yml run --rm \
       -e DATABASE_URL=$DATABASE_URL \
       payouts pnpm --filter @hashden/db db:migrate:deploy
     ```
   - Or attach to the `payouts` container and run the same command.
3. Verify each service:
   - `curl https://api.hashden.app/hashden/groups` → `[]` (or 200 with empty list)
   - `curl https://app.hashden.app` → 200 HTML
   - `nc -vz stratum.hashden.app 3333` → connection succeeds

## 4. Smoke test on dev-* before prod cutover

- Browse `https://dev-app.hashden.app` end-to-end:
  1. NIP-07 sign-in
  2. `/new` → create a SOLO_SHOWCASE group with the dev project npub
  3. `/me?join=<slug>` → register with a regtest BTC address + a dev LN address
  4. Point a (regtest) miner at `dev-stratum.hashden.app:3333` — confirm shares appear in `/g/<slug>` and rows land in `Share` table.
  5. Run regtest E2E: see `infrastructure/regtest/` (next section).

## 5. Mainnet alpha cutover (only after dev-* is fully green)

- Same compose, same secrets-shape — set `NETWORK=mainnet`, prod URLs, real `PLATFORM_BTC_ADDRESS`.
- **First mainnet group must be SOLO_SHOWCASE** — no PPLNS until we've seen at least one block confirm + mature + payout end-to-end on mainnet.
- Live-monitor (Grafana / Coolify metrics): hashrate per group, share-accept rate, payout-success %, RPC tunnel health, ZMQ heartbeat, template-rebuild latency, payouts queue depth.

## Risks / known gaps

- **Raw TCP 3333 → host port collision.** Coolify's Traefik handles HTTP only. We bind 3333 directly to the host. Both dev + prod can't share one host. If you want both on `135.181.144.43`, dev must use a different host port (e.g. 3343).
- **Bitcoin Knots is on Umbrel, not on the VPS.** Connectivity rides Tailscale. If Tailscale flaps the templates source falls back to PLATFORM_DEFAULT (already coded; circuit-broken).
- **Postgres backups not configured here.** Add Coolify's scheduled backup or wire a separate dump cron before mainnet alpha.
- **NSEC at rest.** Ensure Coolify's secret-storage encryption is on; `PROJECT_NSEC_HEX` reaches the payouts container only.
