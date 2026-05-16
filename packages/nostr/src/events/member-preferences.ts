// Kind 30078 — Hashden member preferences.
//
// Distinct from member-registration: this event only carries display
// preferences (currently `show_pubkey`). Separate d-tag space so that
// updating a preference doesn't overwrite the registration's BTC /
// Lightning addresses, and vice versa. Both replaceable.

import type { UnsignedEvent } from "../nip07.js";

export interface MemberPreferencesContent {
  /**
   * When true, the platform's read endpoints return this member's npub
   * as-is. When false (default), they return a stable per-den
   * anonymized id. Per-den preference; not global.
   */
  show_pubkey: boolean;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;

export function buildMemberPreferencesEvent(args: {
  memberPubkey: string;
  slug: string;
  content: MemberPreferencesContent;
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.memberPubkey)) {
    throw new Error("memberPubkey must be 64 hex chars");
  }
  if (!SLUG_RE.test(args.slug)) {
    throw new Error("invalid slug");
  }
  if (typeof args.content.show_pubkey !== "boolean") {
    throw new Error("show_pubkey must be boolean");
  }

  return {
    kind: 30078,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: args.memberPubkey,
    tags: [
      ["d", `member-prefs:${args.slug}`],
      ["app", "hashden"],
      ["a", `30078:${args.slug}`],
    ],
    content: JSON.stringify(args.content),
  };
}
