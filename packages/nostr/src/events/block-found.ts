// Kind 1 (note) — block-found announcement.
//
// When a Hashden group finds a block, the stratum publishes a kind-1
// note signed by the project npub. Tags identify the group + height +
// hash so consumers can build per-group leaderboards by subscribing to
// `#d <slug>` filters.

import type { UnsignedEvent } from "../nip07.js";

export interface BlockFoundContent {
  slug: string;
  height: number;
  blockHash: string;
  /** Coinbase value in sats (decimal-string, big-int safe). */
  rewardSats: string;
  /** Pubkey of the member whose share solved the block (solo-showcase only;
   *  null for PPLNS where the reward is split per share weight). */
  winnerPubkey?: string | null;
  /** Optional human-readable note ("operator runs Knots", etc.). */
  note?: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;

export function buildBlockFoundEvent(args: {
  projectPubkey: string;
  content: BlockFoundContent;
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.projectPubkey)) {
    throw new Error("projectPubkey must be 64 hex chars");
  }
  validateContent(args.content);

  const tags: string[][] = [
    ["d", args.content.slug],
    ["app", "hashden"],
    ["block", args.content.height.toString()],
    ["hash", args.content.blockHash],
  ];
  if (args.content.winnerPubkey) {
    tags.push(["p", args.content.winnerPubkey]);
  }

  const text =
    args.content.note ??
    `${args.content.slug} found block ${args.content.height} (${args.content.blockHash.slice(0, 12)}…) — ${args.content.rewardSats} sats`;

  return {
    kind: 1,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: args.projectPubkey,
    tags,
    content: text,
  };
}

function validateContent(c: BlockFoundContent): void {
  if (!SLUG_RE.test(c.slug)) throw new Error("invalid slug");
  if (!Number.isInteger(c.height) || c.height < 0) {
    throw new Error("invalid block height");
  }
  if (!HASH_RE.test(c.blockHash)) throw new Error("blockHash must be 64 hex chars");
  if (!/^\d+$/.test(c.rewardSats)) {
    throw new Error("rewardSats must be a non-negative decimal-string");
  }
  if (c.winnerPubkey != null && !PUBKEY_RE.test(c.winnerPubkey)) {
    throw new Error("winnerPubkey must be 64 hex chars");
  }
}
