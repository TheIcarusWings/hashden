# Roadmap

Where Hashden is heading. This is the *public* roadmap — short, deliberately ranked, and revisited every few weeks. The exhaustive design context is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Shipped (open alpha)

- Multi-tenant stratum with worker-name share routing (`<den-slug>.<pubkey>.<rig>`)
- Marketplace worker-name tolerance: strips a leading `<btc-address>` prefix so rented hashpower (DirectHash, NiceHash, …) that hard-codes the `address.worker` convention attributes to dens
- Den-page last-hour stats: shares, active members, and active workers (distinct rigs; shares now persist their `<rig-id>`)
- Live den pages: a 30s soft-refresh keeps hashrate, last-hour stats, coinbase preview, blocks and payouts current on their own (with a "live" indicator; pauses on hidden tabs)
- Multi-output coinbase: PPLNS + solo-showcase + operator fee + platform fee + dust bucket (200 fuzz cases, real-hardware validated)
- NIP-07-signed den creation and member registration
- Per-den npub visibility control: anonymous by default, opt in at join time or toggle anytime on /me (including operators who also mine their own den)
- Per-den template source: operators can plug in their own Bitcoin RPC; circuit-breaker fallback to platform default
- Maturity watcher → on-chain payout recording → Lightning dust fan-out (LNbits or NWC) → NIP-57 zap receipt publishing
- AES-256-GCM encryption of operator credentials at rest
- Live marketplace + dashboard at [hashden.app](https://hashden.app)
- **Build transparency:** every app image (web, stratum, payouts) is cosign-signed (keyless → Rekor) + SLSA-attested in CI and published to GHCR; dev + prod pull the signed images — **no service builds on the VPS** — and the web app reports the running commit at `/api/version` + a self-serve `/verify` page, so anyone can prove hashden.app runs the public repo via `gh attestation verify`
- **Coinbase verifier** (`apps/verifier`): a stratum-proxy CLI + signed Docker image (`ghcr.io/theicaruswings/hashden-verify`) a miner runs on their own hardware to confirm — before hashing — that every job pays their address (SOLO: ≈ full reward; PPLNS: present + floor), trusting the server for nothing. One-command usage documented at [/docs](https://hashden.app/docs)
- In-app `/support` donation page — two ways to tip: a **NIP-57 zap** to the project npub signed by the visitor's NIP-07 extension (WebLN one-click + zap-receipt confirmation), or a **BTCPay**-backed unified BIP21 QR (Lightning + on-chain in one code, live status). Voluntary project tip, fully separate from the non-custodial member-payout flow (env-gated, hidden when unconfigured)
- 188 tests across the monorepo, CI gates every push

## Near-term (next ~weeks)

These are funded by attention, not blocked on research.

- **Nostr-relay-driven den discovery.** Today the marketplace lists dens from our Postgres index. Subscribe to kind-30078 events from a curated relay set and surface dens created via other Nostr clients — Postgres becomes a cache, not the source of truth.
- **Operator dashboard polish:** last-block-time, accumulated platform fee paid, member-leaderboard widgets.
- **WebSocket push from stratum** for live hashrate — *deferred*. The 30s soft-refresh (Shipped) already covers liveness for a rolling-average number; a push channel is only worth its cost at higher concurrent-viewer counts. Design when needed: a timer recomputes the cheap current-window hashrate only for dens with a connected viewer and broadcasts it — clusters via the shared DB (each worker recomputes), so no Redis fan-out, and `@fastify/websocket` + a REST-first/poll-fallback browser client.
- **Documentation site expansion** at `/docs` — flesh out the den-operator runbook (BTC address custody, fee rotations, RPC failover).
- **Build transparency — remaining hardening.** The signed-image pipeline is live on dev + prod (above). Still to do: **reproducible builds** so a third party can rebuild the image byte-for-byte; and a **browser extension** (Code-Verify style) that checks the code your browser actually receives against the published release.

## Mid-term (next ~months)

These are bigger and shape the v2 product story.

- **Stratum V2 support** alongside V1. Template sovereignty for miners; a real upgrade path for the modern Bitaxe firmware that supports it.
- **BOLT12 offers** as a payout option for operators who want static recurring fee receipts.
- **NIP-29 group chat per den.** A members-only relay with NIP-42 auth, so each den has a place to coordinate without leaving Hashden.
- **Operator reputation system.** Aggregate NIP-1985 labels and NIP-58 badges across the marketplace; surface them on listings.

## Long-term / research

- **FROST-coordinated coinbase signing.** The MVP relies on the platform building the coinbase; an attacker who compromises the stratum could in principle swap outputs. A FROST-threshold-signed coinbase, where members co-sign the payout split, removes this trust assumption entirely. Pattern: study [OCEAN TIDES](https://ocean.xyz/docs/tides) and [Braidpool's FROST design](https://braidpool.github.io/braidpool/).
- **Weak-block accumulation** (Braidpool-style) for smoother PPLNS payouts on smaller dens.
- **Geographic relay diversity** for the den-metadata event publishing — don't let any single relay become a censorship point for dens.
- **Federated marketplace.** If multiple Hashden-compatible marketplaces exist, dens should be discoverable across them via Nostr event tags rather than being tied to a single web frontend.

## Explicit non-goals

- **Custody.** Hashden does not and will not hold member funds between blocks. Sub-dust amounts get bundled into the operator's coinbase output and the operator fans them out — that's the closest we get, and it's the operator custodying, not the platform.
- **KYC.** Identity is Nostr identity. No emails, no phone numbers, no government IDs.
- **Closed-source operator tooling.** All operator-facing code is GPL-3.0-or-later. If you build an integration, it stays open too.
- **Mandatory verification proxy.** The coinbase verifier is an *optional* spot-check tool a miner can run to confirm payouts. Routing all mining through it (an "enforce" proxy as the default path) is a non-goal — it would add a failure point to normal mining and isn't how Hashden is meant to be used.

## How to influence the roadmap

- File an [issue](https://github.com/TheIcarusWings/hashden/issues) explaining the use case.
- DM [`@icaruswings`](https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5) on Nostr.
- Submit a PR with a partial implementation; concrete code moves things up the list faster than threads do.
