# Coinbase verifier — design

A small tool a miner runs on **their own** machine to confirm, *before hashing*,
that the block they're being handed actually pays **their** address. It needs to
trust hashden.app for **nothing** about getting paid.

## Why it works

Stratum V1 hands the miner everything required to reconstruct the coinbase:

- `mining.subscribe` response → `extranonce1` (4 bytes) + `extranonce2_size` (default 8).
- each `mining.notify` → `coinbase1`, `coinbase2`, merkle branches, version, nbits, ntime.

`coinbase = coinbase1 + extranonce1 + extranonce2 + coinbase2` is the full,
legacy-serialized coinbase transaction. **All payout outputs live in the
`coinbase2` tail** and don't depend on `extranonce2`, so the verifier can parse
every output (scriptPubKey + sats) from data the miner already receives.

The total block reward is the **sum of the coinbase outputs** (conservation
invariant), and that sum must equal the real block subsidy + fees or the network
rejects the block — so `my_share = my_output / sum(outputs)` needs **no external
oracle**, and can be sanity-checked against the known halving subsidy.

## What it proves (and the honest limits)

- **SOLO_SHOWCASE (strong):** every job pays **my** address ≈ the whole reward
  (≥ a configured floor). If the server redirects the reward, my output drops →
  caught before a block is wasted. Near-complete trustlessness.
- **PPLNS (partial):** my address is **present** with a plausible (> 0, optional
  floor) amount. Full PPLNS correctness needs the share-window counts (off-chain,
  server-attested) which can't be recomputed trustlessly — so this is
  presence + floor, not a full proof.
- **Out of scope:** dust-bucket Lightning fan-out (post-block, operator-side) and
  other members' payouts (privacy; not the miner's concern).

## Architecture — a stratum proxy (firmware-agnostic)

```
miner (Bitaxe/ASIC) ──► hashden-verify (localhost) ──► den stratum (e.g. :3333)
                          observes subscribe + every notify
                          reconstructs coinbase, checks outputs vs MY address
                          monitor: alert        enforce: drop a failing job
```

- Works with **any** Stratum V1 miner (Bitaxe, ASIC, rented hashpower) — no
  firmware changes.
- **monitor** mode (MVP): forwards everything, logs ✓/✗ per job. Zero risk.
- **enforce** mode (later): refuse to forward a failing job so the rig never
  hashes it.
- Plaintext TCP both sides; per-connection line-buffered JSON-RPC parsing.

## The check (per job)

1. Reconstruct `coinbase1 + extranonce1 + 00…(extranonce2_size) + coinbase2`.
2. Parse outputs with bitcoinjs-lib.
3. Encode **my** address → scriptPubKey (`bitcoin.address.toOutputScript`, the same
   call `packages/coinbase/src/script.ts` uses, so bytes match by construction).
4. Sum my matching outputs; `share = mine / total`.
5. SOLO: `share ≥ minRewardShare`. PPLNS: `mine > 0` (+ optional floor). Absent → fail.

## Config (all local — no server trust for the core check)

```
--den       stratum.hashden.app:3333    # upstream
--listen    127.0.0.1:3333              # where the rig connects
--address   bc1q...                     # the address I registered (I know it)
--rule      solo | pplns
--min-share 0.90                        # solo floor (fraction of reward)
--network   mainnet | testnet | regtest
--strict                                # exit non-zero on a failing job
```

The miner supplies their **own** address, so the verifier never depends on the
server's (redacted) member data.

## Repo / reuse / license

- `apps/verifier` — CLI `hashden-verify` (npx + small Docker image; run on a
  Pi/PC next to the rig).
- bitcoinjs-lib + tiny-secp256k1 for tx parse + address encoding (same libs &
  `toOutputScript` call as `packages/coinbase`, so encodings are byte-identical).
- **GPL-3.0-or-later** (miner/operator-facing).

## Non-negotiables

- **Coinbase invariants:** read-only — mirrors output logic, never imports/changes
  `packages/coinbase`; its 200 fuzz cases stay green.
- **Anonymity:** runs miner-side with the miner's *own* address; fetches only
  public den rules (optional, UX); exposes nothing about other members.
- **Non-custodial:** this is the strongest expression of it.

## Build order

1. **MVP (this):** monitor proxy + solo full-share check + pplns presence/floor +
   unit tests on the trust-critical core (reconstruct/parse/verify).
2. Optional den-rules fetch (display feeBps/payoutRule), subsidy sanity check.
3. `enforce` mode + Docker image + `/docs` runbook.
