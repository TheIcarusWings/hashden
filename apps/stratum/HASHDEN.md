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
