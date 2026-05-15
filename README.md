# Hashden

A marketplace of Bitcoin solo-mining **dens**. Find a den, point your Bitaxe at it, chase blocks together. Payouts go straight into the coinbase — no platform balance in the middle, no PPLNS ledger to trust someone about.

[![CI](https://github.com/TheIcarusWings/hashden/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/TheIcarusWings/hashden/actions/workflows/ci.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](./LICENSE)

**Live (open alpha):** [hashden.app](https://hashden.app) · **Docs:** [hashden.app/docs](https://hashden.app/docs) · **Nostr:** [`npub13uw…d5ry`](https://primal.net/p/npub13uw3c3k6ahe5wkx9c3jxaslmzp8apwde75raw6nfch8nmeaferxqv3d5ry)

---

## What is Hashden?

A **den** is a self-run mini-pool: someone with a Nostr identity opens it, sets a fee and a payout rule, and miners join by pointing their hardware at the den's stratum endpoint. When the den finds a block, the **coinbase transaction itself pays every member directly** — one output per miner, weighted by their share contribution, minus the operator's fee. Nobody custodies anyone's bitcoin between block and payout.

The gap Hashden fills: pure solo wins nothing 99.999% of the time, mega-pools are opaque and custodial, and projects like OCEAN and Braidpool — which proved non-custodial pool payouts are workable — are each a *single* pool operator. Hashden is multi-tenant by design. Many dens, many operators, one shared infrastructure, all signed by Nostr identities.

## How payouts work

```
miner registers → stratum routes shares → den finds block →
   coinbase pays every member on-chain → dust members get fanned out
   over Lightning by the operator → every payout publishes a NIP-57
   zap receipt on Nostr (publicly auditable)
```

1. Miner registers with a den via NIP-07, providing a BTC address (mandatory) and Lightning address (for amounts below the dust threshold).
2. Bitaxe/ASIC connects to `stratum.hashden.app:3333` with worker name `<den-slug>.<miner-pubkey>.<rig-id>`.
3. Each accepted share is recorded against the (den, member) pair.
4. When the den finds a block, the coinbase transaction is built with N outputs: one per member weighted by the den's payout rule (PPLNS share window or solo-showcase winner-takes-all), minus the operator fee and the platform fee.
5. Members whose share is below the dust threshold get bundled into the operator's *dust bucket* output, then fanned out as Lightning payments after the block matures (operator-side, via the operator's own LNbits or NWC).
6. Every payout — on-chain and Lightning — emits a [NIP-57 zap receipt](https://github.com/nostr-protocol/nips/blob/master/57.md) to public relays. Operators can't quietly skim.

## What works today

Mainnet open alpha — invite a den, plug in your hardware. Edges may be rough.

- Multi-tenant stratum with worker-name share routing
- Multi-output coinbase builder (200 fuzz cases passing, real Bitaxe validated end-to-end on the dev environment)
- NIP-07-signed den creation and member registration
- Live marketplace at [hashden.app](https://hashden.app): browse dens, see hashrate, recent blocks, payout history, operator reputation
- Maturity watcher: matured-block coinbase outputs recorded; Lightning dust fan-out via LNbits or NWC; NIP-57 zap receipts published per payout
- Operators can plug in their **own Bitcoin RPC** (e.g. their own Knots node) for `getblocktemplate`; platform falls back to its default node if the operator's RPC times out (circuit-breaker, 60s retry)
- Postgres backups daily to off-site MinIO, plus Hetzner whole-VM snapshots

## Try it

**Just mine:** open [hashden.app](https://hashden.app), pick a den, follow the instructions on the den page. You'll need a Nostr browser extension (Alby, nos2x) and a BTC address.

**Open your own den:** [hashden.app/new](https://hashden.app/new). Sign with NIP-07, pick a fee and payout rule, share the link.

**Run it locally** (for development):

```sh
git clone git@github.com:TheIcarusWings/hashden.git
cd hashden

pnpm install
git config core.hooksPath .githooks       # enable repo-local secret scan
brew install gitleaks                     # macOS; see github.com/gitleaks/gitleaks otherwise

docker compose -f infrastructure/docker-compose.yml up -d
cp .env.example .env                      # fill in your local Bitcoin RPC creds

pnpm --filter @hashden/db db:migrate:dev  # apply schema
pnpm dev                                  # turbo run dev across all apps
```

You'll need a Bitcoin Core / Knots node reachable from your dev machine. The repo includes a [regtest harness](infrastructure/regtest/) (`infrastructure/regtest/run-e2e.ts`) for end-to-end testing without a real node.

## Layout

```
apps/
  stratum/    multi-tenant stratum server (NestJS, forked from public-pool)
  web/        Next.js marketplace + dashboard + docs
  payouts/    Node worker: maturity watcher, Lightning dust fan-out, zap receipts
packages/
  coinbase/   multi-output coinbase builder (PPLNS + solo-showcase + fees)
  crypto/     AES-256-GCM operator-credential encryption
  db/         Prisma schema + generated client
  groups/     den (group) routing + PPLNS window computation
  nostr/      NIP-07 / NIP-33 / NIP-57 helpers, event builders, multi-relay publish
  shared/     shared TypeScript types
  templates/  per-den Bitcoin RPC client + circuit-breaker health
infrastructure/
  coolify/    production docker-compose (Coolify-deployable)
  regtest/    local end-to-end harness with bitcoind regtest
```

## Stack

- Turborepo + pnpm workspaces, Node ≥20, TypeScript strict everywhere
- Postgres 16, Redis 7
- NestJS (stratum), Next.js 15 + React 19 (web), plain Node worker (payouts)
- Bitcoin Core / Knots over Tailscale RPC
- Nostr: NIP-07 (browser signer), NIP-33 (parameterized replaceable events for den metadata), NIP-57 (zap receipts)
- Lightning: LNbits or NWC (operator's choice, encrypted at rest)
- Coolify on Hetzner for production

## Architecture & roadmap

For the full design — vision, decisions, schema, payout-rule semantics, regulatory considerations — see [ARCHITECTURE.md](./ARCHITECTURE.md).

What's next (the short version):

- **Stratum V2** support for template sovereignty
- **FROST-coordinated coinbase** for fully threshold-signed non-custodial payouts (study OCEAN TIDES / Braidpool patterns)
- **BOLT12 offers** for recurring operator-fee receipts
- **NIP-29 group chat** per den (members-only relay)
- **Nostr-relay-driven den discovery**: surface dens created via other Nostr clients, not just our Postgres index

## Contributing

Bug reports and feature ideas are welcome via [GitHub Issues](https://github.com/TheIcarusWings/hashden/issues). Pull requests too, though for non-trivial changes please open an issue first to talk through the approach. The full guide is in [CONTRIBUTING.md](./CONTRIBUTING.md).

**Security-sensitive findings** (payouts, fees, credentials, signing) — please don't file a public issue. See [SECURITY.md](./SECURITY.md) for the disclosure channel.

The pre-commit hook at `.githooks/pre-commit` scans staged changes with [gitleaks](https://github.com/gitleaks/gitleaks); CI runs the same scan over full history. Enable the hook with `git config core.hooksPath .githooks` after cloning.

## License

[GPL-3.0-or-later](./LICENSE) across the entire project. `apps/stratum/` is forked from [`benjamin-wilson/public-pool`](https://github.com/benjamin-wilson/public-pool) (also GPL-3.0); see [`apps/stratum/HASHDEN.md`](apps/stratum/HASHDEN.md) for attribution and the list of Hashden-specific changes layered on top of upstream.

## Acknowledgements

- [Benjamin Wilson](https://github.com/benjamin-wilson) for [public-pool](https://github.com/benjamin-wilson/public-pool), the stratum base.
- [OCEAN](https://ocean.xyz) (especially [TIDES](https://ocean.xyz/docs/tides) and [DATUM](https://ocean.xyz/docs/datum)) and [Braidpool](https://braidpool.github.io/braidpool/) for proving non-custodial pool payouts at scale.
- The [Bitaxe](https://bitaxe.org) community for making solo mining a real long-tail again.
- Bitcoin Core, Bitcoin Knots, LNbits, and the Nostr Implementation Possibilities maintainers — all of this is built on their work.

## Contact

Project Nostr: [`npub13uw3c3k6ahe5wkx9c3jxaslmzp8apwde75raw6nfch8nmeaferxqv3d5ry`](https://primal.net/p/npub13uw3c3k6ahe5wkx9c3jxaslmzp8apwde75raw6nfch8nmeaferxqv3d5ry)
