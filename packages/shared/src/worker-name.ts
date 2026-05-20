// Worker username parser.
//
// Hashden routes shares to groups based on the stratum worker username.
// Format: `<group-slug>.<member-pubkey>[.<worker-id>]`
//
// `<member-pubkey>` may be supplied in either form:
//   - 64-char lowercase hex (Nostr's internal canonical encoding)
//   - bech32 `npub1…` (what users see in Nostr clients — preferred for UX)
//
// Both decode to the same 32-byte secp256k1 x-only point. The returned
// `memberPubkey` is always hex so downstream DB lookups don't have to care
// which form arrived on the wire.
//
// Examples:
//   "demo.02a1b2c3...d4e5f6.bitaxe-01"            → hex form
//   "demo.npub1q4p…m9z.bitaxe-01"                 → bech32 form
//   "demo.02a1b2c3...d4e5f6"                      → no worker id
//
// Marketplace tolerance: rented-hashpower marketplaces (DirectHash, NiceHash,
// …) hard-code the classic solo-pool username convention `<btc-address>.<worker>`
// and prepend the renter's BTC payout address. Hashden takes the payout address
// from den membership, not the worker, so a leading BTC address is just noise we
// strip before parsing. This lets such marketplaces attribute to dens unchanged:
//   "bc1q…ulav.demo.npub1q4p…m9z.bitaxe-01"       → same as "demo.npub1…m9z.bitaxe-01"
//
// This is a pure function — no DB lookups, no network calls. Membership
// validation (does this group exist? is this pubkey a member?) is done by
// the stratum's GroupRouterService against the database.

import { nip19 } from "nostr-tools";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_HEX_RE = /^[0-9a-f]{64}$/;
const PUBKEY_NPUB_RE = /^npub1[02-9ac-hj-np-z]{58}$/;
// Worker ids: alnum + dash + underscore, up to 32 chars.
const WORKER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
// Loose shape match for a leading BTC payout address some marketplaces inject
// (bech32 mainnet/testnet/regtest, or base58 legacy P2PKH/P2SH). This only
// gates *whether to strip* a prefix — final correctness is the slug+pubkey
// parse on the remainder, so it deliberately doesn't verify the address.
const BTC_ADDR_RE =
  /^(bc1|tb1|bcrt1)[a-z0-9]{6,87}$|^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/;

export type ParsedWorkerName =
  | {
      ok: true;
      slug: string;
      /** Always hex (64 chars); decoded from npub if input was bech32. */
      memberPubkey: string;
      workerId: string | null;
    }
  | {
      ok: false;
      reason: WorkerNameError;
    };

export type WorkerNameError =
  | "EMPTY"
  | "MISSING_PUBKEY"
  | "INVALID_SLUG"
  | "INVALID_PUBKEY"
  | "INVALID_WORKER_ID"
  | "TOO_MANY_PARTS";

export function parseWorkerName(input: unknown): ParsedWorkerName {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }

  let parts = input.split(".");

  // Drop a marketplace-injected leading BTC payout address (see header note).
  // Only when something routable remains (≥3 parts) AND position 1 isn't itself
  // a pubkey — i.e. the layout is `<btc>.<slug>.<pubkey>[.<rig>]`, never the
  // native `<slug>.<pubkey>.<rig>` where position 1 IS the pubkey. This keeps
  // genuinely malformed names (e.g. `slug.pubkey.rig.extra`) rejected below.
  if (
    parts.length >= 3 &&
    BTC_ADDR_RE.test(parts[0]!) &&
    normalizePubkey(parts[1]!) === null
  ) {
    parts = parts.slice(1);
  }

  if (parts.length < 2) return { ok: false, reason: "MISSING_PUBKEY" };
  if (parts.length > 3) return { ok: false, reason: "TOO_MANY_PARTS" };

  const [slug, memberPubkeyRaw, workerId] = parts;

  if (!SLUG_RE.test(slug!)) return { ok: false, reason: "INVALID_SLUG" };

  const memberPubkey = normalizePubkey(memberPubkeyRaw!);
  if (memberPubkey === null) {
    return { ok: false, reason: "INVALID_PUBKEY" };
  }

  if (workerId !== undefined && !WORKER_ID_RE.test(workerId)) {
    return { ok: false, reason: "INVALID_WORKER_ID" };
  }

  return {
    ok: true,
    slug: slug!,
    memberPubkey,
    workerId: workerId ?? null,
  };
}

/**
 * Returns the 64-char lowercase hex form of `input` if it is a valid
 * Nostr public key in either hex or `npub1…` bech32 form. Returns null
 * for anything that isn't recognizable as a pubkey — never throws.
 */
function normalizePubkey(input: string): string | null {
  if (PUBKEY_HEX_RE.test(input)) return input;
  if (!PUBKEY_NPUB_RE.test(input)) return null;
  try {
    const decoded = nip19.decode(input);
    if (decoded.type !== "npub") return null;
    return decoded.data as string;
  } catch {
    return null;
  }
}
