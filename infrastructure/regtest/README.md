# Regtest E2E

Drives the payouts worker pipeline against a real bitcoind regtest. First iteration covers maturity + recordOnChainPayouts only. Lightning fanout + crash-recovery are listed gaps below.

## Prereqs

```sh
# 1. Dev datastore
docker compose -f infrastructure/docker-compose.yml up -d

# 2. Bitcoind regtest
docker compose -f infrastructure/regtest/docker-compose.yml up -d

# 3. Migration applied to dev DB
DATABASE_URL=postgresql://hashden:hashden_dev@localhost:5432/hashden_dev \
  pnpm --filter @hashden/db db:migrate:deploy
```

## Run

```sh
DATABASE_URL=postgresql://hashden:hashden_dev@localhost:5432/hashden_dev \
  pnpm tsx infrastructure/regtest/run-e2e.ts
```

Expected final line: `[regtest] DONE — basic maturity + record-on-chain pipeline green.`

## What this covers

- bitcoind RPC connectivity from `@hashden/templates`' `BitcoinRpcClient`
- `checkMaturity` promotes a `FOUND` block to `MATURED` once it has ≥100 confs
- `recordOnChainPayouts` writes a `PayoutAttempt(kind=ON_CHAIN_COINBASE, status=PAID)` row with the correct sats

## What's NOT covered yet

These are explicitly out of scope for the first iteration; they require additional infra:

1. **Multi-output coinbase build** (PPLNS split + dust bucket). Covered by 200 fuzz cases in `@hashden/coinbase`'s unit tests; would require running stratum with a CPU miner against this regtest to exercise end-to-end. Wiring TODO.
2. **Lightning dust fan-out** (`fanoutDust`). Needs a fakewallet LNbits instance + a Group with `operatorLnSecret` populated. Add a service to `infrastructure/regtest/docker-compose.yml` (image: `lnbits/lnbits-legend` with `LNBITS_BACKEND_WALLET_CLASS=FakeWallet`).
3. **Crash recovery (`reconcileInFlight`)**. Needs a way to SIGKILL the worker mid-fan-out. The script would: start fanout in background → kill PID → restart worker → assert all `IN_FLIGHT` rows settle to `PAID|FAILED`.
4. **Zap-receipt publishing**. Needs an ephemeral relay (e.g. `scsibug/nostr-rs-relay`) and a check that `PayoutAttempt.zapEventId` is populated.

## Reset

```sh
docker compose -f infrastructure/regtest/docker-compose.yml down -v   # nukes regtest chain
DATABASE_URL=postgresql://hashden:hashden_dev@localhost:5432/hashden_dev \
  pnpm --filter @hashden/db prisma migrate reset --force --skip-seed
```
