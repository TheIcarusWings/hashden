// Kind 30078 — Hashden member-record fetch request.
//
// A signed, short-lived event that proves the member owns their pubkey so the
// platform can return THEIR OWN private payout addresses (btcAddress,
// lightningAddress) to pre-fill the "manage payout" form. Distinct d-tag space
// (member-record:<slug>) so it can't be replayed as a registration or
// preferences write — and it carries no content: it's purely an authenticated
// read, not a replaceable record anyone needs to keep.

import type { UnsignedEvent } from "../nip07.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;

export function buildMemberRecordRequestEvent(args: {
  memberPubkey: string;
  slug: string;
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.memberPubkey)) {
    throw new Error("memberPubkey must be 64 hex chars");
  }
  if (!SLUG_RE.test(args.slug)) {
    throw new Error("invalid slug");
  }
  return {
    kind: 30078,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: args.memberPubkey,
    tags: [
      ["d", `member-record:${args.slug}`],
      ["app", "hashden"],
      ["a", `30078:${args.slug}`],
    ],
    content: "",
  };
}
