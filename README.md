# Hashden

A marketplace of Bitcoin solo-mining groups with Nostr-native identity, discovery, and payouts.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design doc.

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

## Development

```sh
pnpm install
git config core.hooksPath .githooks   # enable repo-local pre-commit hooks
brew install gitleaks                 # macOS; see github.com/gitleaks/gitleaks for other platforms
```

The pre-commit hook runs [gitleaks](https://github.com/gitleaks/gitleaks) on staged changes and refuses commits containing secrets. CI runs the same scan over the full history on every push.

## License

[GPL-3.0-or-later](./LICENSE) across the entire project. The stratum under [`apps/stratum/`](apps/stratum/) is forked from [`benjamin-wilson/public-pool`](https://github.com/benjamin-wilson/public-pool) (also GPL-3.0); see [`apps/stratum/HASHDEN.md`](apps/stratum/HASHDEN.md) for attribution and the list of Hashden-specific changes.
