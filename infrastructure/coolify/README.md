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
  - `PROJECT_NPUB` / `PROJECT_NSEC` — Nostr keypair this deployment uses to sign block-found notes and NIP-57 zap receipts. Each accepts either bech32 (`npub1…` / `nsec1…`) or 64-char hex. Can be a dedicated key or the maintainer's personal key; the public-facing npub should match whichever you advertise as your contact identity. The nsec only needs to reach the payouts container. *(Legacy names `PROJECT_NPUB_HEX` / `PROJECT_NSEC_HEX` still work.)*
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
PROJECT_NPUB=<npub1... or 64-char hex>
PROJECT_NSEC=<nsec1... or 64-char hex>          # payouts only — but compose passes it; safe because secret is per-env
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

## Build transparency — deploying the signed image (dev)

Goal: let anyone prove `hashden.app` runs the public code. CI now builds the web
image *off the VPS*, signs it, and publishes provenance; Coolify's job shifts
from *building* to *pulling a pinned, signed digest*. This also takes the
RAM-heavy web build off the CX33.

**What CI produces.** `.github/workflows/release-web.yml` runs on every push to
`dev` (and manual dispatch). It builds `apps/web/Dockerfile`, pushes to
`ghcr.io/theicaruswings/hashden-web` (tags `sha-<commit>` and `dev`),
cosign-keyless-signs the digest (→ public Rekor log), and attaches a SLSA
build-provenance attestation. The commit is baked into the image as
`HASHDEN_BUILD_SHA`, surfaced at `/api/version` and `/verify`.

**One-time GitHub setup:**

1. **Environment `dev`** (Settings → Environments → New `dev`). Add these as
   **Variables** (not secrets — they're public, baked into the JS bundle). They
   must match the dev deploy's runtime values or the bundle points at the wrong
   API:
   ```
   NEXT_PUBLIC_HASHDEN_API_URL=https://dev-api.hashden.app
   NEXT_PUBLIC_HASHDEN_STRATUM_URL=stratum+tcp://dev-stratum.hashden.app:3343
   NEXT_PUBLIC_HASHDEN_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net
   NEXT_PUBLIC_APP_URL=https://dev.hashden.app
   NEXT_PUBLIC_DONATIONS_ENABLED=false
   NEXT_PUBLIC_ZAP_NPUB=
   ```
2. **Make the GHCR package public** (repo → Packages → `hashden-web` →
   Package settings → Change visibility → Public). Required so end-users — and
   Coolify pulling unauthenticated — can fetch and verify it. (Verification via
   `cosign`/`gh` works even while private, but public is the point.)

**Cutover (dev only — prod keeps building from source until dev is proven).**
The compose file is *shared* by both envs, so do **not** edit the `web`
service's `build:` block in `docker-compose.yml` (that would change prod too).
Instead, for the **dev** Coolify resource, override the `web` service to pull
the image:

```yaml
# dev override — web pulls the signed image instead of building it
services:
  web:
    image: ghcr.io/theicaruswings/hashden-web:sha-<commit>   # pin the digest in practice
    build: !reset null   # drop the inherited build: block on dev
```

Apply it the way our Coolify version supports (compose override file for the dev
resource, or switch the dev resource to a "Docker Image" source). Pin the exact
`@sha256:…` digest from the workflow summary rather than a moving tag.

**Trigger redeploys** from CI by calling the dev resource's Coolify deploy
webhook after the image is pushed (Coolify → dev resource → Webhooks). Turn off
that resource's git auto-deploy so it doesn't also try to build.

**Verify the loop:**

```sh
# what dev says it's running
curl -s https://dev.hashden.app/api/version

# prove that image came from the repo (run on your own machine)
cosign verify ghcr.io/theicaruswings/hashden-web:sha-<commit> \
  --certificate-identity-regexp '^https://github.com/TheIcarusWings/hashden/.github/workflows/release-web.yml@refs/heads/dev' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Once dev is green end-to-end, copy the workflow job for `main` (a `prod`
Environment + the prod resource's webhook) and repeat the cutover for prod.

## Locking dev to Tailscale

Production (`hashden.app`, `api.hashden.app`, `stratum.hashden.app`) must stay reachable from the public internet. Development (`dev.*`) doesn't — and shouldn't, since dev frequently runs in-progress code with weaker validation.

Lock dev behind Tailscale via a Traefik file-provider router that gates the dev hostnames with an IP allow-list middleware. Two file-provider artifacts ship in this directory:

- [`traefik-tailscale-only.yaml`](./traefik-tailscale-only.yaml) — defines the `tailscale-only` middleware (`100.64.0.0/10` allow-list).
- [`traefik-hashden-dev-lockdown.yaml`](./traefik-hashden-dev-lockdown.yaml) — defines higher-priority routers for `dev.hashden.app` + `dev-api.hashden.app` that apply the middleware and forward to the dev web/stratum containers by IP.

Why file-provider instead of per-app Coolify "Custom Labels": Coolify's docker-compose buildpack overrides any conflicting `traefik.http.routers.*` label at deploy time, so the middleware can't be attached to Coolify's auto-router. A separate router via compose labels would also collide because the same compose applies to prod (shared service definitions would load-balance across environments). The file-provider lives host-level with explicit, dev-only service definitions and sidesteps both.

**1. Install the middleware + router files on the VPS:**

```sh
scp infrastructure/coolify/traefik-tailscale-only.yaml \
  root@<your-vps>:/data/coolify/proxy/dynamic/tailscale-only.yaml
scp infrastructure/coolify/traefik-hashden-dev-lockdown.yaml \
  root@<your-vps>:/data/coolify/proxy/dynamic/hashden-dev-lockdown.yaml
```

Coolify's Traefik watches `/data/coolify/proxy/dynamic/` and hot-reloads — no restart needed.

**2. Install the IP-refresh helper:**

The dev container IPs in `hashden-dev-lockdown.yaml` rotate on every dev deploy because Coolify recreates containers. The companion script keeps the file in sync:

```sh
scp infrastructure/coolify/update-dev-lockdown.sh \
  root@<your-vps>:/usr/local/bin/hashden-update-dev-lockdown.sh
ssh root@<your-vps> chmod +x /usr/local/bin/hashden-update-dev-lockdown.sh
ssh root@<your-vps> '(crontab -l; echo "* * * * * /usr/local/bin/hashden-update-dev-lockdown.sh >> /var/log/hashden-lockdown.log 2>&1") | crontab -'
```

The script is idempotent (no-op when IPs haven't changed) so the per-minute cron is quiet 99% of the time. After a dev deploy, the gate is broken for at most ~60 sec until the cron picks up the new IPs.

**3. Verify:**

```sh
# from your laptop on Tailscale, hitting the VPS tailnet IP:
curl --resolve dev.hashden.app:443:<vps-tailnet-ip> https://dev.hashden.app   # → 200

# from anywhere not on Tailscale (your phone on cellular, or hitting public DNS):
curl https://dev.hashden.app                                                   # → 403 Forbidden
```

The VPS tailnet IP shows up via `ssh root@<vps> tailscale ip -4`.

Prod hostnames (`hashden.app`, `api.hashden.app`) stay open throughout — they don't appear in `hashden-dev-lockdown.yaml`, so Coolify's auto-routers serve them with no middleware.

**4. Using dev from your browser (tailnet members):**

Public DNS for `dev.hashden.app` points at the VPS's *public* IP — so a tailnet member browsing the domain still goes via the public internet, hits the middleware with their public source IP, and gets 403. The middleware only lets through requests that arrive on the tailnet (source IP in `100.64.0.0/10`).

Two ways to route your browser via tailnet:

- **Quick (per-machine):** add to `/etc/hosts` on every tailnet device:
  ```
  <vps-tailnet-ip> dev.hashden.app dev-api.hashden.app
  ```
  Browser now resolves to the tailnet IP and connects via tailnet. Source IP at Traefik is your tailnet IP. Pass.

- **Better (org-wide):** Tailscale admin console → DNS → Override DNS for these hostnames at the tailnet level (MagicDNS / split-horizon). Applies to all your tailnet devices automatically, no per-machine setup.

## Risks / known gaps

- **Raw TCP 3333 → host port collision.** Coolify's Traefik handles HTTP only. We bind 3333 directly to the host. Both dev + prod can't share one VPS on the same port — use `STRATUM_HOST_PORT` on dev (e.g. 3343) to avoid the clash.
- **Bitcoin node on a separate host.** If your Bitcoin RPC isn't local to the VPS (e.g. it runs at home over Tailscale), connectivity becomes a moving part. Hashden's template source falls back to PLATFORM_DEFAULT when an operator's RPC times out (circuit-broken, 60s retry); your platform-default endpoint should always be reachable.
- **Postgres backups not configured here.** Add Coolify's scheduled backup or wire a separate dump cron before mainnet alpha.
- **NSEC at rest.** Ensure Coolify's secret-storage encryption is on; `PROJECT_NSEC` reaches the payouts container only.
