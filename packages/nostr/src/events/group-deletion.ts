// Kind 5 — NIP-09 group deletion request.
//
// Hashden treats a NIP-09 deletion request signed by the den's operator
// as authoritative intent to soft-delete the den. The deletion targets
// the den's parameterized-replaceable kind-30078 metadata event using
// an `a` tag (NIP-33 addressable form): `30078:<operator-pubkey>:<slug>`.
//
// The server verifies:
//   1. signature is valid
//   2. event.pubkey === the den's operatorPubkey on record
//   3. `a` tag's d-tag matches the den's slug
//   4. created_at is recent (replay protection — see server)
//
// On accept, the den's `visibility` is set to DELETED. Historical
// payouts, blocks, and share records are preserved; only the den is
// hidden from listings and blocked from accepting new members/shares.

import type { UnsignedEvent } from "../nip07.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;

export function buildGroupDeletionEvent(args: {
  operatorPubkey: string;
  slug: string;
  /** Optional reason — surfaced in event content for clients that show it. */
  reason?: string;
  /** Optional override for testing; defaults to current time. */
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.operatorPubkey)) {
    throw new Error("operatorPubkey must be 64 hex chars");
  }
  if (!SLUG_RE.test(args.slug)) {
    throw new Error("slug must match /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/");
  }

  return {
    kind: 5,
    pubkey: args.operatorPubkey,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [
      // NIP-33 addressable reference: kind:pubkey:d-tag
      ["a", `30078:${args.operatorPubkey}:${args.slug}`],
      // NIP-09 v2 — explicit kind of what's being deleted.
      ["k", "30078"],
      // Hashden-specific marker so generic Nostr clients can filter.
      ["app", "hashden"],
    ],
    content: args.reason ?? "den deleted by operator",
  };
}

export type ParsedDeletionTarget =
  | {
      ok: true;
      kind: number;
      operatorPubkey: string;
      slug: string;
    }
  | { ok: false; reason: string };

/**
 * Parses an `a` tag value of the form `kind:pubkey:d-tag` and returns the
 * components. Returns `ok: false` for malformed tags.
 */
export function parseAddressableTag(value: unknown): ParsedDeletionTarget {
  if (typeof value !== "string") {
    return { ok: false, reason: "not a string" };
  }
  const parts = value.split(":");
  if (parts.length !== 3) {
    return { ok: false, reason: "expected kind:pubkey:d-tag (3 parts)" };
  }
  const kind = Number.parseInt(parts[0]!, 10);
  if (!Number.isFinite(kind)) {
    return { ok: false, reason: "kind is not numeric" };
  }
  if (!PUBKEY_RE.test(parts[1]!)) {
    return { ok: false, reason: "pubkey must be 64 hex chars" };
  }
  if (!SLUG_RE.test(parts[2]!)) {
    return { ok: false, reason: "d-tag (slug) malformed" };
  }
  return { ok: true, kind, operatorPubkey: parts[1]!, slug: parts[2]! };
}
