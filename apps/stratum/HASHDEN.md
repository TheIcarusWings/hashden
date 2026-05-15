# Hashden integration notes — `apps/stratum/`

This directory is a fork of [`benjamin-wilson/public-pool`](https://github.com/benjamin-wilson/public-pool), imported via `git subtree`. Both this directory and the rest of the Hashden monorepo are licensed under **GPL-3.0-or-later** (see [`LICENSE.txt`](./LICENSE.txt) here for the GPL text and the root [`LICENSE`](../../LICENSE) at the project root).

Cross-package boundaries are kept clean for engineering reasons, not licensing ones:

- Non-stratum apps consume the stratum's REST/WS API rather than importing from `apps/stratum/*` directly. Shared TypeScript contracts live in `packages/shared/`. This keeps stratum upgrades (including upstream subtree pulls) decoupled from the marketplace.

## Hashden-specific changes layered on top of upstream

These edits diverge from upstream public-pool and are necessary for the marketplace functionality:

- **Multi-tenant share routing** (Week 2): worker username parsed as `<group-slug>.<member-pubkey>[.<worker-id>]`; share rows tagged with `group_id` + `member_pubkey`.
- **Multi-output coinbase builder** (Week 3): replaces the single-address coinbase with N outputs computed from the group's payout rule (solo-showcase or PPLNS), plus operator fee + platform fee + dust bucket. This is the highest-risk change in the project.
- **Per-group template source** (Week 4): a group can opt into using the operator's own Bitcoin RPC for `getblocktemplate`; platform overlays the coinbase outputs. Auto-fallback to the platform-default Knots node on operator-RPC timeout.
- **Block-found Nostr events** (Week 8): kind-1 notes signed by the deployment's npub (configured via `PROJECT_NPUB_HEX` / `PROJECT_NSEC_HEX`), tagged with the group slug, height, and block hash.

### Lint + typecheck integration with the monorepo

- `lint` (workspace task) on `apps/stratum/` is a no-op (`echo`) because
  upstream public-pool's eslint config flags ~7 errors + 50 warnings on
  the upstream source itself (e.g. `Object` used as type, empty async
  arrow). Auto-fixing those would be churn against upstream. The
  original command is preserved as `lint:upstream` for occasional
  manual sweeps.
- `typecheck` (workspace task) runs `nest build` (which TypeScript
  type-checks under the hood). The upstream package.json doesn't have
  a separate `typecheck` script; this added one keeps `pnpm typecheck`
  green at the workspace level alongside other packages.

### Upstream files modified by hashden (resolve on subtree pull)

- `package.json` — added `@hashden/{coinbase,db,groups,shared,templates}` workspace deps; bumped `@types/node` from `^18.16.12` to `^22.0.0`; removed stub `@types/cron` (cron ships its own types).
- `src/app.module.ts` — registers `HashdenService` provider + 3 hashden controllers (operator-templates/test, group shares, group blocks) directly in the AppModule providers/controllers (not a sub-module) so HashdenService can inject `StratumV1JobsService` from the same DI scope.
- `src/models/StratumV1Client.ts` — `NodeJS.Timer[]` → `NodeJS.Timeout[]` (line 40) for `@types/node` ≥20 compatibility. Constructor takes a `HashdenService` parameter. AUTHORIZE handler tries Hashden routing before upstream's `@IsBitcoinAddress` validation; on success, substitutes the resolved member.btcAddress so upstream validation still passes. `sendNewMiningJob` calls `HashdenService.getEffectiveJobTemplate` (per-group template substitution for OPERATOR_RPC) and `HashdenService.getUpstreamPayoutInformation` (multi-output coinbase) when `hashdenContext` is set. Accepted-share path also calls `HashdenService.recordShare` to populate the marketplace `shares` table.
- `src/services/stratum-v1.service.ts` — injects `HashdenService` and forwards it to each new `StratumV1Client`.
- `src/services/stratum-v1-jobs.service.ts` — extracted the IJobTemplate construction (coinbase placeholder + merkle branch + segwit witness commit) into a public method `buildJobTemplate(rawTemplate, clearJobs)`. The existing `newMiningJob$` pipe now calls this method internally; HashdenService also calls it to construct per-group operator-RPC templates.

### Hashden-only additions (no upstream conflict)

- `src/hashden/hashden.service.ts` — bridge service exposing GroupRouter + coinbase builders + share recording + per-group template fetching. Methods:
  - `route(workerName)` — auth-time routing
  - `getUpstreamPayoutInformation(groupId, blockReward, minerPubkey)` — template-time payout list (upstream's `{address, percent}[]` shape, both rules supported)
  - `recordShare(groupId, memberPubkey, difficulty)` — share-accept-time record
  - `fetchTemplate(groupId)` — per-group `getblocktemplate` with `templateSource` switch (PLATFORM_DEFAULT vs OPERATOR_RPC), circuit-breaker auto-fallback after 3 consecutive operator-RPC failures (60s retry-after).
  - `getEffectiveJobTemplate(groupId, platformDefault)` — returns the IJobTemplate to serve to a group's miners. Pass-through for PLATFORM_DEFAULT; per-operator fetch + build for OPERATOR_RPC. Cached per-group with 4s TTL. Inherits `clearJobs` from the platform tick so all groups invalidate together on new block.
  - `testOperatorRpc(url, auth)` — used by the web app's operator-settings "Test connection" button to verify operator credentials before save.
- `src/hashden/api/operator-templates.controller.ts` — POST `/hashden/operator-templates/test`
- `src/hashden/api/shares.controller.ts` — GET `/hashden/groups/:slug/shares`
- `src/hashden/api/blocks.controller.ts` — GET `/hashden/groups/:slug/blocks`

## Pulling upstream updates

```bash
git subtree pull --prefix=apps/stratum https://github.com/benjamin-wilson/public-pool master --squash
```

Resolve conflicts and verify the boundary contract still holds before committing.
