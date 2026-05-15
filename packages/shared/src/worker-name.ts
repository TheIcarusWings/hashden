// Worker username parser.
//
// Hashden routes shares to groups based on the stratum worker username.
// Format: `<group-slug>.<member-pubkey-hex>[.<worker-id>]`
//
// Examples:
//   "demo.02a1b2c3...d4e5f6.bitaxe-01"  → group "demo", member 02a1…, worker "bitaxe-01"
//   "demo.02a1b2c3...d4e5f6"            → group "demo", member 02a1…, no worker
//
// This is a pure function — no DB lookups, no network calls. Membership
// validation (does this group exist? is this pubkey a member?) is done by
// the stratum's GroupRouterService against the database.

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// Nostr pubkeys are 32-byte secp256k1 x-only points: 64 hex chars.
const PUBKEY_RE = /^[0-9a-f]{64}$/;
// Worker ids: alnum + dash + underscore, up to 32 chars.
const WORKER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export type ParsedWorkerName =
  | {
      ok: true;
      slug: string;
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

  const parts = input.split(".");
  if (parts.length < 2) return { ok: false, reason: "MISSING_PUBKEY" };
  if (parts.length > 3) return { ok: false, reason: "TOO_MANY_PARTS" };

  const [slug, memberPubkey, workerId] = parts;

  if (!SLUG_RE.test(slug!)) return { ok: false, reason: "INVALID_SLUG" };
  if (!PUBKEY_RE.test(memberPubkey!)) {
    return { ok: false, reason: "INVALID_PUBKEY" };
  }
  if (workerId !== undefined && !WORKER_ID_RE.test(workerId)) {
    return { ok: false, reason: "INVALID_WORKER_ID" };
  }

  return {
    ok: true,
    slug: slug!,
    memberPubkey: memberPubkey!,
    workerId: workerId ?? null,
  };
}
