# Hashden — Coolify deploy runbook

Two environments share the same compose file (`docker-compose.yml` in this dir):

| env  | branch | web                 | api                  | stratum (raw TCP)              |
| ---- | ------ | ------------------- | -------------------- | ------------------------------ |
| dev  | `dev`  | dev.hashden.app     | dev-api.hashden.app  | dev-stratum.hashden.app:**3343** |
| prod | `main` | hashden.app (apex)  | api.hashden.app      | stratum.hashden.app:**3333**     |

Plus `www.hashden.app` (CNAME → `hashden.app`) which Traefik 301-redirects to the apex.

Coolify deploys each as its own "Docker Compose" resource pointed at this file with separate env vars. The two stacks share one VPS host, so the raw-TCP stratum port is parameterized via the `STRATUM_HOST_PORT` env var so they can coexist:

- **prod env** does not set it → defaults to `3333` (the standard miner port).
- **dev env** sets `STRATUM_HOST_PORT=3343` → bound on the host as `:3343`.

Inside both containers stratum still listens on `3333` (`STRATUM_PORT`); only the host-side mapping differs. Miners on dev point at `dev-stratum.hashden.app:3343`; miners on prod point at `stratum.hashden.app:3333`.

## 0. Prerequisites

- A VPS with public IP (any provider; we run on Hetzner). DNS records pointing at it:
  - A records: `@` (apex), `api`, `stratum`, and the dev counterparts (`dev`, `dev-api`, `dev-stratum`)
  - CNAME `www` → apex
- Generated secrets (back up to your password manager — never commit):
  - `OPERATOR_CREDS_ENC_KEY` — 32-byte hex, generated with `openssl rand -hex 32`. Same value across stratum + payouts.
  - `PROJECT_NPUB_HEX` / `PROJECT_NSEC_HEX` — Nostr keypair this deployment uses to sign block-found notes and NIP-57 zap receipts. Can be a dedicated key or the maintainer's personal key; the public-facing npub should match whichever you advertise as your contact identity. The nsec only needs to reach the payouts container.
- Platform cold BTC address — generate from a hardware wallet, save seed phrase to your password manager. **Mainnet only**; for dev use any regtest/testnet address you control.
- A Bitcoin Core / Knots node the VPS can reach over RPC + ZMQ. Standard mainnet ports are RPC 8332, ZMQ rawblock 28332, ZMQ hashblock 28333. If the node runs on a separate machine (e.g. an Umbrel at home), the cleanest tunnel is Tailscale: install on both ends, address by the node's Tailscale IP.

## 1. Coolify project

In Coolify UI (`http://<your-vps-ip>:8000` — default Coolify port):

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
# Bitcoin Core / Knots — mainnet defaults shown; adjust if your node uses non-standard ports
BITCOIN_RPC_URL=http://<your-bitcoin-rpc-host>:8332
BITCOIN_RPC_USER=<rpc-user>
BITCOIN_RPC_PASSWORD=<set in Coolify UI; do not commit>
BITCOIN_ZMQ_HOST=tcp://<your-bitcoin-rpc-host>:28332     # rawblock; stratum subscribes here
# Hashden secrets — generate per environment, store in your password manager
OPERATOR_CREDS_ENC_KEY=<32-byte hex>           # openssl rand -hex 32
PROJECT_NPUB_HEX=<hex>
PROJECT_NSEC_HEX=<hex>                          # payouts only — but compose passes it; safe because secret is per-env
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
NEXT_PUBLIC_HASHDEN_STRATUM_URL=stratum+tcp://dev-stratum.hashden.app:3343
STRATUM_HOST_PORT=3343
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
  2. `/new` → create a SOLO_SHOWCASE group with the dev npub
  3. `/me?join=<slug>` → register with a regtest BTC address + a dev LN address
  4. Point a (regtest) miner at `dev-stratum.hashden.app:3333` — confirm shares appear in `/g/<slug>` and rows land in `Share` table.
  5. Run regtest E2E: see `infrastructure/regtest/` (next section).

## 5. Mainnet alpha cutover (only after dev-* is fully green)

- Same compose, same secrets-shape — set `NETWORK=mainnet`, prod URLs, real `PLATFORM_BTC_ADDRESS`.
- **First mainnet group must be SOLO_SHOWCASE** — no PPLNS until we've seen at least one block confirm + mature + payout end-to-end on mainnet.
- Live-monitor (Grafana / Coolify metrics): hashrate per group, share-accept rate, payout-success %, RPC tunnel health, ZMQ heartbeat, template-rebuild latency, payouts queue depth.

## Risks / known gaps

- **Raw TCP 3333 → host port collision.** Coolify's Traefik handles HTTP only. We bind 3333 directly to the host. Both dev + prod can't share one VPS on the same port — use `STRATUM_HOST_PORT` on dev (e.g. 3343) to avoid the clash.
- **Bitcoin node on a separate host.** If your Bitcoin RPC isn't local to the VPS (e.g. it runs at home over Tailscale), connectivity becomes a moving part. Hashden's template source falls back to PLATFORM_DEFAULT when an operator's RPC times out (circuit-broken, 60s retry); your platform-default endpoint should always be reachable.
- **Postgres backups not configured here.** Add Coolify's scheduled backup or wire a separate dump cron before mainnet alpha.
- **NSEC at rest.** Ensure Coolify's secret-storage encryption is on; `PROJECT_NSEC_HEX` reaches the payouts container only.
