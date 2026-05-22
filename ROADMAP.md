# Roadmap

Where Hashden is heading. This is the *public* roadmap — short, deliberately ranked, and revisited every few weeks. The exhaustive design context is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Shipped (open alpha)

- Multi-tenant stratum with worker-name share routing (`<den-slug>.<pubkey>.<rig>`)
- Marketplace worker-name tolerance: strips a leading `<btc-address>` prefix so rented hashpower (DirectHash, NiceHash, …) that hard-codes the `address.worker` convention attributes to dens
- Den-page last-hour stats: shares, active members, and active workers (distinct rigs; shares now persist their `<rig-id>`)
- Multi-output coinbase: PPLNS + solo-showcase + operator fee + platform fee + dust bucket (200 fuzz cases, real-hardware validated)
- NIP-07-signed den creation and member registration
- Per-den npub visibility control: anonymous by default, opt in at join time or toggle anytime on /me (including operators who also mine their own den)
- Per-den template source: operators can plug in their own Bitcoin RPC; circuit-breaker fallback to platform default
- Maturity watcher → on-chain payout recording → Lightning dust fan-out (LNbits or NWC) → NIP-57 zap receipt publishing
- AES-256-GCM encryption of operator credentials at rest
- Live marketplace + dashboard at [hashden.app](https://hashden.app)
- In-app `/support` donation page — two ways to tip: a **NIP-57 zap** to the project npub signed by the visitor's NIP-07 extension (WebLN one-click + zap-receipt confirmation), or a **BTCPay**-backed unified BIP21 QR (Lightning + on-chain in one code, live status). Voluntary project tip, fully separate from the non-custodial member-payout flow (env-gated, hidden when unconfigured)
- 188 tests across the monorepo, CI gates every push

## Near-term (next ~weeks)

These are funded by attention, not blocked on research.

- **Nostr-relay-driven den discovery.** Today the marketplace lists dens from our Postgres index. Subscribe to kind-30078 events from a curated relay set and surface dens created via other Nostr clients — Postgres becomes a cache, not the source of truth.
- **Operator dashboard polish:** last-block-time, accumulated platform fee paid, member-leaderboard widgets.
- **WebSocket push from stratum** for live hashrate (web currently polls).
- **Auto-refresh** of `/g/[slug]/coinbase-preview` (30s).
- **Documentation site expansion** at `/docs` — flesh out the den-operator runbook (BTC address custody, fee rotations, RPC failover).
- **Build transparency / verifiable deploys.** Prove that hashden.app runs the public code: CI builds the web image, signs it (cosign keyless → Rekor) and SLSA-attests it on every push; the running commit is exposed at `/api/version` + a `/verify` page with self-serve verification commands; then Coolify deploys the pinned signed digest instead of building on the VPS. *(Shipping in stages: signing pipeline + `/verify` surfaces first on dev. Still to come: Coolify cutover to the signed digest, reproducible builds, and a browser-extension / coinbase verifier so users can check the code their browser receives and the payout their miner hashes.)*

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

## How to influence the roadmap

- File an [issue](https://github.com/TheIcarusWings/hashden/issues) explaining the use case.
- DM [`@icaruswings`](https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5) on Nostr.
- Submit a PR with a partial implementation; concrete code moves things up the list faster than threads do.
