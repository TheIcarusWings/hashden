// NIP-57 zap receipt builder (kind 9735).
//
// The brief calls for every payout — both the on-chain coinbase outputs
// AND the Lightning dust fan-outs — to be backed by a public Nostr zap
// receipt. This is the trust substitute for the platform: anyone can
// audit the operator-fee + platform-fee + member outputs by joining the
// dots between the kind-1 block-found event and the kind-9735 receipts.
//
// At MVP we publish receipts with a simplified shape compared to NIP-57
// proper: we don't have a "zap request" event upstream (that's a
// peer-to-peer interaction); instead we treat the on-chain coinbase
// payment OR the operator's Lightning fan-out as the zap. The receipt
// references the kind-1 block-found event so consumers can build a
// complete audit graph from each block.

import type { UnsignedEvent } from "@hashden/nostr";

export interface ZapReceiptInput {
  /** Project npub (hex). */
  projectPubkey: string;
  /** Pubkey of the recipient (the member). */
  recipientPubkey: string;
  /** Sats amount (decimal-string for big-int safety). */
  amountSats: string;
  /** Block-found event id from kind-1 publish; the receipt e-tags this. */
  blockEventId: string;
  /** "ON_CHAIN_COINBASE" or "LN_DUST" — surfaced as a tag for filtering. */
  kind: "ON_CHAIN_COINBASE" | "LN_DUST";
  /** For LN_DUST: the bolt11 invoice that was paid. Optional for ON_CHAIN. */
  bolt11?: string;
  /** For LN_DUST: payment-hash hex. Optional for ON_CHAIN. */
  paymentHash?: string;
  /** For ON_CHAIN_COINBASE: the block hash + tx id of the coinbase. */
  blockHash?: string;
  createdAt?: number;
}

export function buildZapReceiptEvent(input: ZapReceiptInput): UnsignedEvent {
  if (!/^[0-9a-f]{64}$/.test(input.projectPubkey)) {
    throw new Error("projectPubkey must be 64 hex chars");
  }
  if (!/^[0-9a-f]{64}$/.test(input.recipientPubkey)) {
    throw new Error("recipientPubkey must be 64 hex chars");
  }
  if (!/^\d+$/.test(input.amountSats)) {
    throw new Error("amountSats must be a non-negative decimal-string");
  }
  if (!/^[0-9a-f]{64}$/.test(input.blockEventId)) {
    throw new Error("blockEventId must be 64 hex chars");
  }

  const tags: string[][] = [
    ["p", input.recipientPubkey],
    ["e", input.blockEventId],
    ["amount", (BigInt(input.amountSats) * 1000n).toString()], // amount tag is millisats per NIP-57
    ["app", "hashden"],
    ["payout_kind", input.kind],
  ];
  if (input.bolt11) tags.push(["bolt11", input.bolt11]);
  if (input.paymentHash) tags.push(["preimage_hash", input.paymentHash]);
  if (input.blockHash) tags.push(["block", input.blockHash]);

  const summary =
    input.kind === "LN_DUST"
      ? `dust fan-out: ${input.amountSats} sats`
      : `on-chain coinbase: ${input.amountSats} sats`;

  return {
    kind: 9735,
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: input.projectPubkey,
    tags,
    content: summary,
  };
}
