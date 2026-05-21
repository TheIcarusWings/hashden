// Kind 30078 — Hashden member registration.
//
// A member registers (or updates) their {btc_address, lightning_address}
// for a group by signing this event. The d-tag is `member:<slug>` which
// is parameterized-replaceable: re-publishing replaces the previous
// registration on relays, and the platform's POST endpoint upserts.

import type { UnsignedEvent } from "../nip07.js";

export interface MemberRegistrationContent {
  btc_address: string;
  lightning_address: string;
  // Per-den display preference. Omit to leave the platform default
  // (anonymized) on first join and to preserve the existing value when
  // re-registering only to update addresses — the upsert keeps the prior
  // value when this key is absent. Set explicitly to opt in/out at join.
  show_pubkey?: boolean;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;
const LN_ADDR_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildMemberRegistrationEvent(args: {
  memberPubkey: string;
  slug: string;
  content: MemberRegistrationContent;
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.memberPubkey)) {
    throw new Error("memberPubkey must be 64 hex chars");
  }
  if (!SLUG_RE.test(args.slug)) {
    throw new Error("invalid slug");
  }
  if (!args.content.btc_address) throw new Error("btc_address required");
  if (!LN_ADDR_RE.test(args.content.lightning_address)) {
    throw new Error("lightning_address must be user@host.tld");
  }
  if (
    args.content.show_pubkey !== undefined &&
    typeof args.content.show_pubkey !== "boolean"
  ) {
    throw new Error("show_pubkey must be a boolean when present");
  }

  // Build the content explicitly so an absent show_pubkey stays absent on
  // the wire (rather than serializing `undefined`), letting the platform
  // upsert preserve a member's existing visibility on address-only edits.
  const content: MemberRegistrationContent = {
    btc_address: args.content.btc_address,
    lightning_address: args.content.lightning_address,
  };
  if (typeof args.content.show_pubkey === "boolean") {
    content.show_pubkey = args.content.show_pubkey;
  }

  return {
    kind: 30078,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: args.memberPubkey,
    tags: [
      ["d", `member:${args.slug}`],
      ["app", "hashden"],
      ["a", `30078:${args.slug}`],
    ],
    content: JSON.stringify(content),
  };
}
