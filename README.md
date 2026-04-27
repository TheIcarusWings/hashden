# Hashden

A marketplace of Bitcoin solo-mining groups with Nostr-native identity, discovery, and payouts.

See [`solopool.md`](./solopool.md) for the project brief.

## Layout

```
apps/
  stratum/    multi-tenant stratum server (fork of benjamin-wilson/public-pool, GPL-3.0)
  web/        Next.js marketplace + dashboard
  payouts/    dust fan-out worker (Lightning, post-maturity)
packages/
  shared/     shared TypeScript types
  nostr/      NIP-07 / NIP-33 / NIP-57 helpers
  db/         Prisma schema + generated client
infrastructure/
              Docker Compose, Coolify configs, Tailscale unit files
```

## Stack

- Turborepo + pnpm workspaces, Node ≥20, TypeScript everywhere
- Postgres 16 + Redis 7
- Coolify on a shared Hetzner VPS (Traefik for TLS)
- Bitcoin Core/Knots via Tailscale RPC tunnel
- Nostr (NIP-07 auth, kind 30078 group metadata, kind 9735 zap receipts)

## License

Root project: MIT (`LICENSE`).
`apps/stratum/`: GPL-3.0-or-later (`apps/stratum/LICENSE`), preserved from the upstream public-pool fork. Other apps consume the stratum's REST/WS API and are not derivative works.
