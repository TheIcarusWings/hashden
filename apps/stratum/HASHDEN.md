# GPL-3.0 boundary — Hashden integration notes

This directory is a fork of [`benjamin-wilson/public-pool`](https://github.com/benjamin-wilson/public-pool), imported via `git subtree` and licensed under **GPL-3.0-or-later** (see `LICENSE.txt`).

## Boundary contract

The rest of the Hashden monorepo (`apps/web/`, `apps/payouts/`, all `packages/*`) is licensed under **MIT**. To preserve that license boundary:

- **No code outside `apps/stratum/` may `import` from `apps/stratum/*`.** Cross-package contracts live in `packages/shared/`.
- The stratum exposes a **REST/WS API**. Other Hashden apps consume that API and are therefore not derivative works of the GPL'd code.
- New code added inside `apps/stratum/` is GPL-3.0. New code in other directories that uses only published API surfaces stays MIT.
- Code review must reject any direct import that crosses this boundary.

## Hashden-specific changes layered on top of upstream

These edits diverge from upstream public-pool and are necessary for the marketplace functionality:

- **Multi-tenant share routing** (Week 2): worker username parsed as `<group-slug>.<member-pubkey>[.<worker-id>]`; share rows tagged with `group_id` + `member_pubkey`.
- **Multi-output coinbase builder** (Week 3): replaces the single-address coinbase with N outputs computed from the group's payout rule (solo-showcase or PPLNS), plus operator fee + platform fee + dust bucket. This is the highest-risk change in the project.
- **Per-group template source** (Week 4): a group can opt into using the operator's own Bitcoin RPC for `getblocktemplate`; platform overlays the coinbase outputs. Auto-fallback to the platform-default Knots node on operator-RPC timeout.
- **Block-found Nostr events** (Week 8): kind-1 notes signed by the project npub, tagged with the group slug, height, and block hash.

### Upstream files modified by hashden (resolve on subtree pull)

- `package.json` — added `@hashden/{coinbase,db,groups,shared}` workspace deps; bumped `@types/node` from `^18.16.12` to `^22.0.0`; removed stub `@types/cron` (cron ships its own types).
- `src/app.module.ts` — added `HashdenModule` import + registered in module imports.
- `src/models/StratumV1Client.ts` — `NodeJS.Timer[]` → `NodeJS.Timeout[]` (line 40) for compatibility with `@types/node` ≥20 where the two types are no longer aliases.

### Hashden-only additions (no upstream conflict)

- `src/hashden/hashden.module.ts` — NestJS module
- `src/hashden/hashden.service.ts` — bridge service exposing GroupRouter + coinbase builders to the upstream stratum's existing share-accept and template-build paths. Not yet wired into those paths; that's a follow-up commit.

## Pulling upstream updates

```bash
git subtree pull --prefix=apps/stratum https://github.com/benjamin-wilson/public-pool master --squash
```

Resolve conflicts and verify the boundary contract still holds before committing.
