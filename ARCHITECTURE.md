# Hashden — Architecture & design notes

A self-contained design doc for Hashden: the vision, the core decisions, the architecture, and the road from MVP to non-custodial v2. Written for a reader with no prior context on the project.

---

## 1. Vision

Hashden is a **marketplace of solo-mining groups** on Bitcoin, with Nostr-native identity, discovery, and payouts.

Anyone can create a "group" (a mini-pool) with their own fee, payout rule, and branding. Miners discover groups via Nostr, join by pointing their Bitaxe/ASIC at the group's stratum endpoint, and receive Lightning payouts. Group operators are Nostr identities — discoverable, rateable, reputable.

### Why this gap exists

No existing project combines all three of:

1. Open-source solo mining infrastructure (public-pool, ckpool).
2. Group / cooperative payouts (OCEAN, Braidpool — but these are *single* pool operators, not marketplaces).
3. Nostr-native identity, discovery, and payouts.

OCEAN and Braidpool proved non-custodial pool payouts are technically viable. Bitaxe's explosion created a long tail of hobbyist miners who currently have two choices: pure solo (win nothing 99.999% of the time) or mega-pools (opaque, centralized). The unfilled space is **small, opinionated, community-run groups**.

---

## 2. Core product decisions

These are the foundational decisions — change them deliberately, not casually.

| Decision | Choice | Rationale |
|---|---|---|
| Custody model (MVP) | **Custodial Lightning payouts** | Block reward → operator wallet → LNbits fan-out to members. Ships in 4-6 weeks. |
| Custody model (v2) | **Non-custodial coinbase split** | OCEAN TIDES / Braidpool FROST pattern. No custody risk. Months of R&D. |
| Stratum base | **Fork `benjamin-wilson/public-pool`** | NestJS/TypeScript, MIT-friendly stack, GPL-3.0 license. Cleaner to extend than ckpool (C). |
| Nostr scope | **Full: auth + group events + payouts + reputation** | Differentiates vs. closed pools. NIP-07 auth, NIP-33 group metadata, NIP-57 zap receipts. |
| Hosting | **Existing Hetzner VPS + Umbrel's Bitcoin node via Tailscale** | See §7. Saves ~700GB of VPS disk. |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Hetzner VPS                                 │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────┐     │
│  │ Stratum (fork  │  │  Next.js web    │  │  Payout engine │     │
│  │ public-pool)   │  │  (marketplace   │  │  (Node worker) │     │
│  │ multi-tenant   │  │   + dashboard)  │  │                │     │
│  └───────┬────────┘  └────────┬────────┘  └───────┬────────┘     │
│          │                    │                   │              │
│          └────────┬───────────┴───────────────────┘              │
│                   │                                              │
│           ┌───────▼────────┐         ┌────────────────┐          │
│           │  Postgres      │         │  Redis         │          │
│           │  (shares,      │         │  (stratum job  │          │
│           │   groups,      │         │   distribution,│          │
│           │   payouts)     │         │   share pubsub)│          │
│           └────────────────┘         └────────────────┘          │
│                                                                  │
│     LNbits (already on VPS) ◄── Lightning payouts                │
└──────────┬───────────────────────────────────────────────────────┘
           │ Tailscale (see §7.2)
           ▼
     Umbrel: Bitcoin Core RPC (8332) + ZMQ (28332/28333)

     Nostr relays (any) ◄── group metadata (NIP-33), block-found events,
                            zap receipts (NIP-57), auth (NIP-07/42)
```

### 3.1 Components

**Stratum server** (forked public-pool, GPL-3.0 — keep at network-API boundary):
- Single stratum V1 listener. Miners connect with worker username `<group-slug>.<member-pubkey>[.<worker>]`; the server routes shares to the right group in the DB. (Alternative: one port/subdomain per group. Worker-name routing is simpler for MVP.)
- Block templates from Bitcoin Core RPC via Tailscale.
- Validates every accepted share; writes `(group_id, member_pubkey, difficulty, ts)` to Postgres.
- On block found: broadcasts block, marks `blocks.status = FOUND`, emits internal event for payout engine.
- Stratum V2 support is explicitly post-MVP.

**Marketplace & dashboard** (Next.js 15):
- `/` marketplace: browse groups by fee, hashrate, operator reputation, payout rule.
- `/g/[slug]` group detail: live hashrate chart, recent blocks, payout history, member leaderboard, operator's Nostr profile.
- `/new` create group (NIP-07 sign-in required).
- `/g/[slug]/settings` operator controls.
- `/me` miner dashboard (hashrate, earnings, Lightning address on file).

**Payout engine** (Node worker):
- Tick loop: find matured blocks (≥100 confirmations), compute PPLNS weights, deduct operator fee, resolve each member's Lightning address via LNURL-pay, pay via LNbits API.
- Publish NIP-57 zap receipt (kind 9735) referencing the block event — every custodial payout is publicly auditable on Nostr. This is the trust substitute.
- Idempotency is critical: use a `payout_attempts` table with a unique `(block_id, member_pubkey)` index, plus Postgres advisory locks around the payout loop.

### 3.2 Nostr event plan

| Purpose | Kind | Notes |
|---|---|---|
| Auth | — | NIP-07 browser extension (Alby, nos2x). NIP-46 bunker for mobile post-MVP. |
| Group metadata | 30078 (NIP-33 parameterized replaceable) | `d` = group slug. Content JSON: name, description, fee_bps, payout_rule, stratum_url, operator_pubkey. Publish to multiple relays. Postgres holds a cache/index for fast queries; Nostr is the source of truth for operator-signed fields. |
| Block found | 1 (kind-1 note) | Tagged `#d <group-slug>` + `#block <height>` + block hash. Builds a public track record per group. |
| Payout receipt | 9735 (NIP-57 zap receipt) | One per member per block. References the block event. |
| Operator reputation | 1985 (labels) + NIP-58 badges | Aggregated by marketplace; shown on listings. |

### 3.3 Group payout rules

- **MVP ships rule 1.** Rules 2-3 are cheap follow-ups (share the same share-tracking infra).

1. **Shared solo (PPLNS, short window)** — last N≈100,000 shares before the block determine weights; operator fee deducted; remainder split proportionally via Lightning. Good default for small hashrate members.
2. **Pure solo showcase** — block finder takes 100% minus operator fee; other members get nothing but appear on leaderboard. Regulatorily safest (no reward pooling).
3. **Hybrid tip jar** — pure solo payout, plus a configurable % goes to a pool rotated to lowest-hashrate members. Good-vibes differentiator.

### 3.4 Database schema sketch

```
groups          (id, slug, operator_pubkey, fee_bps, payout_rule, created_at)
members         (group_id, member_pubkey, lightning_address, joined_at)
shares          (id, group_id, member_pubkey, difficulty, ts)  -- high-volume, partition by day
blocks          (id, group_id, height, hash, reward_sats, status, found_at, matured_at)
payout_attempts (id, block_id, member_pubkey, amount_sats, status, ln_payment_hash, attempted_at)
                  UNIQUE (block_id, member_pubkey)
```

---

## 4. Repo layout (recommended)

Turborepo monorepo, consistent stack across apps:

```
apps/
  stratum/    # forked public-pool, GPL-3.0
  web/        # Next.js 15 marketplace + dashboard
  payouts/    # Node worker
packages/
  shared/     # TS types: group, share, block, payout
  nostr/      # NIP-07 auth helpers, event builders (30078, 9735), validators
infrastructure/
  docker-compose.yml
  nginx/
  tailscale/
prisma/       # or supabase/migrations/ — pick one
```

### License note

`public-pool` is **GPL-3.0**. The forked stratum stays GPL-3.0. Keep the Next.js app and payout engine behind a REST/WebSocket API boundary so they're separate works (they consume the stratum's API; they're not derivatives). That lets the rest of the repo stay under whatever license you prefer (MIT recommended for the marketplace). Document the boundary in `apps/stratum/README.md`.

---

## 5. Implementation roadmap (4-6 weeks to alpha)

### Week 1 — infrastructure & fork
- [ ] Create monorepo.
- [ ] Fork `benjamin-wilson/public-pool` into `apps/stratum/`.
- [ ] Provision a Docker Compose stack on the VPS (separate ports, DB, domain from any other stacks you run there).
- [ ] Set up Tailscale proxy for Bitcoin Core RPC (8332) + ZMQ (28332/28333) from Umbrel to VPS. Pattern: `socat` forwarding over Tailscale — see §7.2.
- [ ] Green-light gate: `bitcoin-cli -rpcconnect=<tailscale-ip> getblockcount` returns current height from the VPS.

### Week 2 — multi-tenant stratum
- [ ] Add `groupId` to share/job records in `apps/stratum/src/stratum/`.
- [ ] Parse `worker.username` as `<group-slug>.<pubkey>[.<worker>]` in `apps/stratum/src/models/client.model.ts`.
- [ ] Keep a single block-template feed in `apps/stratum/src/services/block-template.service.ts` — same Bitcoin, same template, multiple groups.
- [ ] Create Postgres schema (see §3.4).
- [ ] Expose a clean REST/WS API for the Next.js app to consume.

### Week 3 — marketplace web app
- [ ] `apps/web/` scaffold (Next.js 15).
- [ ] NIP-07 login (use `nostr-tools` + `nostr-login` widget).
- [ ] Group create flow: client signs kind-30078 event, publishes to relays, persists cache in Postgres.
- [ ] Miner join flow: validate LN address via LNURL-pay probe, persist, show stratum URL + QR for Bitaxe config.
- [ ] Public marketplace and group detail pages.

### Week 4 — payout engine
- [ ] `apps/payouts/` Node worker.
- [ ] Maturity watcher: `blocks WHERE status='FOUND' AND matured_at IS NULL` → check `bitcoin-cli getblock`, update confirmations, mark `matured_at` at ≥100.
- [ ] PPLNS computation per matured block.
- [ ] LNbits payment execution with idempotency (advisory lock + `payout_attempts` row).
- [ ] Publish NIP-57 zap receipt per member payout.

### Week 5 — Nostr polish & staging
- [ ] Group discovery: subscribe to kind-30078 from a curated relay set, merge with Postgres cache.
- [ ] Operator profile: pull kind-0 metadata, kind-1985 labels, NIP-58 badges.
- [ ] Block-found events published with group `d`-tag.
- [ ] Staging deploy to a `dev-*` subdomain; end-to-end test with a real Bitaxe.
- [ ] Stratum rate limiting + abuse bans; `pg_stat_statements` review.

### Week 6 — alpha launch
- [ ] Invite-only: 3-5 operator groups by known Nostr users.
- [ ] Monitor hashrate, share accept rate, payout correctness, latency.
- [ ] Launch note from a dedicated project Nostr npub (create one for this project — do not reuse personal accounts).

---

## 6. Post-MVP roadmap (do not build in MVP)

- **Non-custodial payouts v2**: coinbase-split template. When a group has >N members, build a coinbase with N outputs weighted by the PPLNS window. Removes custody entirely. Study OCEAN TIDES and Braidpool's FROST design.
- **Stratum V2** support alongside V1 for template sovereignty.
- **Group chat**: NIP-29 relay-based groups. Consider a members-only gated relay with NIP-42 auth.
- **BOLT12 offers** for operators who want static recurring fee receipts.

---

## 7. Infra context you inherit from my other VPS setup

This project runs alongside (not inside) another existing product on the same VPS. That product is unrelated, but its infra patterns are proven and worth reusing. Bullets below document **patterns**, not secrets. Credentials live in your password manager / existing secure notes — do not commit them.

### 7.1 VPS

- Hetzner dedicated VPS, root SSH access, Ubuntu.
- `/opt/<project>/` per-project directory convention, each with its own `docker-compose.yml`.
- Manual rebuild: `docker compose -f docker-compose.yml up -d --build` after pulling. No auto-deploy for infra stacks.
- Reverse-proxied via nginx with Let's Encrypt certs (certbot).

### 7.2 Tailscale bridge to Umbrel

Your Umbrel runs Bitcoin Core and exposes it over its local network only. To reach it from the VPS:

1. Install Tailscale on both the VPS and the Umbrel box; join the same tailnet.
2. On Umbrel, run a `socat` proxy that binds the RPC (8332) and ZMQ (28332/28333) ports to the Tailscale interface.
3. On the VPS, `bitcoin-cli -rpcconnect=<umbrel-tailscale-ip>` and your stratum's `BITCOIN_RPC_URL=http://<umbrel-tailscale-ip>:8332` just work.
4. Health-check the tunnel; if Umbrel sleeps, stratum can't serve templates → miners leave. Alert on RPC unavailability.

### 7.3 Lightning payouts via LNbits

- LNbits already runs on the VPS (BTCPay+LNbits+LND stack, LND reached via Tailscale).
- Create a dedicated **wallet per project** — do not reuse wallets across projects.
- API base: `https://<your-lnbits-host>/api/v1/` — use `Payments` endpoints for LNURL-pay-driven payments.
- The payout engine needs the wallet's *admin key*; store in env var (`LNBITS_ADMIN_KEY`), never commit. Invoice key is read-only — not sufficient for payouts.
- Rate limits: LNbits will happily try to pay faster than LND can route. Throttle concurrent payments (~5-10 in-flight) and retry failed payments with exponential backoff.

### 7.4 Bitcoin Core requirements

- Full node (not pruned) — you need the full UTXO set for block template construction and confirmation tracking.
- Enable ZMQ publishers for `rawblock` and `hashblock` so stratum can react to new blocks instantly.
- `bitcoin.conf` minimums: `server=1`, `rpcuser`/`rpcpassword` or `rpcauth`, `zmqpubrawblock=tcp://0.0.0.0:28332`, `zmqpubhashblock=tcp://0.0.0.0:28333`, `rpcallowip=<tailscale-cidr>`.

### 7.5 Nostr

- No special infra needed — publish to public relays (`wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`, etc.).
- If you want a dedicated / branded relay for this project later, `strfry` is the proven choice; configure read-public / write-auth with NIP-42 if you want a members-only variant for group chat.
- Create a **dedicated project npub** for launch comms. Do not reuse personal accounts for project announcements.

---

## 8. Verification (end-to-end test plan)

1. **Bitcoin RPC reachable from VPS**: `bitcoin-cli -rpcconnect=<tailscale-ip> getblockcount` returns current height.
2. **Stratum accepts a Bitaxe**: point a Bitaxe at `stratum+tcp://stratum.<domain>:3333` with worker `testgroup.<pubkey>.bitaxe01`. Confirm shares appear in `shares` table with correct `group_id` + `member_pubkey`.
3. **Nostr group publish**: create a group in the web UI; verify the kind-30078 event appears on a relay via `nak req -k 30078 -d <slug> wss://relay.damus.io`.
4. **Payout dry-run on regtest**: mine a block on a regtest Bitcoin, fast-forward 100 confs, confirm payout engine computes correct per-member sats and calls LNbits with right amounts. Use an LNbits `fakewallet` so no real sats move.
5. **Mainnet smoke test** with a single *solo-showcase* group (rule #2 — winner takes all) before opening any PPLNS group. Reduces payout-logic surface area for the first real block.
6. **NIP-57 receipt**: after a payout, verify a kind-9735 event with correct `bolt11` and `description` tags appears on relays.

---

## 9. Open risks to resolve before public launch

- **Regulatory (most important)**. Custodial Lightning fan-out likely constitutes money transmission in multiple jurisdictions. Before public launch (not before alpha), get legal advice. Mitigations to consider: (a) require miner LN addresses (no internal custody of member funds), (b) keep operator wallets ≤$X rolling balance, (c) restrict to solo-showcase rule initially (no reward pooling), (d) geoblock where required.
- **GPL-3.0 contamination**. Keep the forked stratum isolated behind an API boundary. Document this in `apps/stratum/README.md`.
- **Bitcoin node reliability**. If Umbrel goes down, stratum stops serving templates. Add monitoring + consider a fallback node on the VPS once disk allows (≥1TB SSD).
- **Operator trust in custodial v1**. Mitigation is radical transparency: every share window and every payout published as Nostr events. Custody without auditability is unacceptable; custody with public auditability is defensible as an MVP.
- **Double-pay via payout engine bugs**. The `payout_attempts` unique index + advisory locks are non-negotiable. Write tests that simulate worker restart mid-payout.

---

## 10. Reference links

- Public Pool (fork base): https://github.com/benjamin-wilson/public-pool
- Public Pool (hosted): https://web.public-pool.io/
- Public Pool on Umbrel App Store: https://apps.umbrel.com/app/public-pool
- CKPool (alternative C base, reference only): https://solo.ckpool.org/
- OCEAN TIDES (non-custodial payout design, for v2): https://ocean.xyz/docs/tides
- OCEAN DATUM (miner-selected templates): https://ocean.xyz/docs/datum
- Braidpool (weak-block + FROST, for v2): https://bitcoinmagazine.com/technical/braidpool-a-second-competitor-in-decentralizing-mining
- NIP-07 (browser signer): https://github.com/nostr-protocol/nips/blob/master/07.md
- NIP-33 (parameterized replaceable events): https://github.com/nostr-protocol/nips/blob/master/33.md
- NIP-57 (zaps & zap receipts): https://github.com/nostr-protocol/nips/blob/master/57.md
- LNbits API docs: https://docs.lnbits.org/
