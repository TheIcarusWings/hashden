# hashden-verify

A tiny tool you run **on your own machine** to confirm — before your rig hashes
anything — that the block a Hashden den hands you actually pays **your** address.
It trusts the server for *nothing* about getting paid.

It sits as a transparent Stratum proxy between your miner and the den, reconstructs
the coinbase from the data the pool already sends every miner, and checks that
your address is among the coinbase outputs (SOLO: ≈ the whole reward; PPLNS:
present, above a floor). See [DESIGN.md](./DESIGN.md) for how/why it works and the
honest limits.

## Run it

```sh
# from the monorepo (dev)
pnpm --filter @hashden/verifier dev -- \
  --den stratum.hashden.app:3333 \
  --address bc1qyouraddress... \
  --rule solo

# or after build
node apps/verifier/dist/cli.js --den ... --address ... --rule solo
```

Then point your miner at the proxy instead of the den:

```
stratum+tcp://<machine-running-verify>:3333
```

Each job is logged:

```
job 1a2b: ✓ OK   — Solo job pays your address 97.50% of the reward (304687500 sats).
job 1a2c: ✗ FAIL — STOLEN? Your address is NOT among the 3 coinbase outputs — this job does not pay you.
```

## Options

| flag | meaning | default |
|---|---|---|
| `--den <host:port>` | the den's stratum (required) | — |
| `--address <addr>` | your payout address (required, stays local) | — |
| `--listen <host:port>` | where your miner connects | `127.0.0.1:3333` |
| `--rule <solo\|pplns>` | the den's payout rule | `solo` |
| `--min-share <0..1>` | SOLO: min fraction of the reward you must get | `0.9` |
| `--min-sats <n>` | PPLNS: min sats you must get | `1` |
| `--network <net>` | `mainnet` / `testnet` / `regtest` | `mainnet` |
| `--strict` | exit on the first failing job (stop the rig) | off |

All flags have `VERIFY_*` env equivalents.

## What it proves

- **SOLO dens:** strong — every job must pay your address ≈ the full reward, or it's
  flagged before you waste work.
- **PPLNS dens:** partial — your address must be present (full share-weight math
  needs off-chain data we deliberately don't trust).

GPL-3.0-or-later.
