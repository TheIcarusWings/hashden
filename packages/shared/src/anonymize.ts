// Per-den pubkey anonymization.
//
// Members opt in to publishing their npub against shares/payouts per
// den. The default is opt-out — read endpoints return a stable
// per-den anonymized id instead of the raw pubkey. Stable so leaderboards
// + repeat-member tracking still work *within* a den. Per-den so the
// same person can't be correlated across multiple dens by ID alone.
//
// Format: `anon-` + first 8 hex chars of sha256(pubkey || ":" || slug).
// 8 chars = 32 bits = a small den has effectively zero collision risk.
// Increase to 16 if a den ever grows to many thousands of members.

// Use @noble/hashes (the same lib nostr-tools depends on) for an
// isomorphic sha256. node:crypto would limit this file to Node, and we
// need the same logic on the web client so it can detect "is this
// anonymized id me?" without round-tripping to the server.
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const ID_LEN = 8;

export function anonymizeMemberPubkey(pubkey: string, slug: string): string {
  const h = bytesToHex(sha256(utf8ToBytes(`${pubkey}:${slug}`))).slice(0, ID_LEN);
  return `anon-${h}`;
}

/**
 * Returns the pubkey if the member has opted in to public display in this
 * den, otherwise the anonymized id. `showPubkey == null` (member not
 * found / pre-opt state) is treated as opt-out, since that's the
 * privacy-preserving default.
 */
export function resolveMemberPubkey(
  pubkey: string,
  slug: string,
  showPubkey: boolean | null | undefined,
): string {
  if (showPubkey === true) return pubkey;
  return anonymizeMemberPubkey(pubkey, slug);
}

/**
 * Helper: returns true when an id looks like one of our anonymized
 * member ids (vs a real pubkey or BTC address). Useful for clients
 * that want to render an "anonymous" badge instead of trying to link
 * out to a Nostr profile.
 */
export function isAnonymizedMemberId(id: string): boolean {
  return /^anon-[0-9a-f]{8}$/.test(id);
}
