// Display helpers for Nostr pubkeys.
//
// Internally the codebase + DB store pubkeys as 64-char lowercase hex
// (Nostr's canonical wire form). For UI we prefer bech32 `npub1…` — that's
// what users see in their Nostr clients, and it matches the worker-name
// format Hashden's stratum accepts.

import { nip19 } from "nostr-tools";

/** Encode a 64-char hex pubkey as bech32 `npub1…`. Returns input unchanged on failure. */
export function hexToNpub(hex: string): string {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return hex;
  }
}

/**
 * Short display form: `npub1abcd…xyz1` — useful in dense UI surfaces.
 * Falls through to a hex short form if encoding fails.
 */
export function shortNpub(hex: string): string {
  const full = hexToNpub(hex);
  if (full.startsWith("npub1")) {
    return `${full.slice(0, 9)}…${full.slice(-4)}`;
  }
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}
