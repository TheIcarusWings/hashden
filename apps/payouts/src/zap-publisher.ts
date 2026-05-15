// Zap-receipt publisher for the payouts worker.
//
// On every payout transition to PAID (both ON_CHAIN_COINBASE rows
// recorded eagerly at maturity, and LN_DUST rows after the Lightning
// send completes), we sign a NIP-57 kind-9735 receipt with the project
// nsec and publish to the configured relay set. The resulting event id
// is stored on PayoutAttempt.zapEventId so a later pass (or worker
// restart) skips already-published receipts — idempotent.
//
// Failures to publish are non-fatal: the on-chain coinbase output OR
// Lightning payment is the source of truth; the receipt is the audit
// trail. We log + swallow publish errors so a transient relay outage
// doesn't block payouts.

import { finalizeEvent } from "nostr-tools/pure";
import {
  buildBlockFoundEvent,
  type UnsignedEvent,
  type SignedEvent,
} from "@hashden/nostr";
import { publishToRelays } from "@hashden/nostr/relays";
import { buildZapReceiptEvent } from "./zap-receipt.js";

export interface ZapPublisherOpts {
  projectNpubHex: string;
  projectNsecHex: string;
  relays: string[];
}

export interface PublishResult {
  ok: boolean;
  eventId?: string;
  reason?: string;
}

export class ZapPublisher {
  private readonly secretKey: Uint8Array;

  constructor(private readonly opts: ZapPublisherOpts) {
    if (!/^[0-9a-f]{64}$/.test(opts.projectNsecHex)) {
      throw new Error("projectNsecHex must be 64 hex chars");
    }
    if (!/^[0-9a-f]{64}$/.test(opts.projectNpubHex)) {
      throw new Error("projectNpubHex must be 64 hex chars");
    }
    this.secretKey = new Uint8Array(
      Buffer.from(opts.projectNsecHex, "hex"),
    );
  }

  /** Sign + publish a single zap receipt. Resolves with ok=true and the
   *  event id on at least one successful relay accept; ok=false with a
   *  reason if all relays rejected or we couldn't sign. */
  async publishZap(args: {
    recipientPubkey: string;
    amountSats: string;
    blockEventId: string;
    kind: "ON_CHAIN_COINBASE" | "LN_DUST";
    bolt11?: string;
    paymentHash?: string;
    blockHash?: string;
  }): Promise<PublishResult> {
    let unsigned: UnsignedEvent;
    try {
      unsigned = buildZapReceiptEvent({
        ...args,
        projectPubkey: this.opts.projectNpubHex,
      });
    } catch (e) {
      return { ok: false, reason: `build failed: ${(e as Error).message}` };
    }
    return this.signAndPublish(unsigned);
  }

  /** Sign + publish a kind-1 block-found note. Used by the stratum, but
   *  we expose it here too for the payouts worker to publish if the
   *  stratum missed it (e.g. crash between block submit and publish). */
  async publishBlockFound(args: {
    slug: string;
    height: number;
    blockHash: string;
    rewardSats: string;
    winnerPubkey?: string;
    note?: string;
  }): Promise<PublishResult> {
    let unsigned: UnsignedEvent;
    try {
      unsigned = buildBlockFoundEvent({
        projectPubkey: this.opts.projectNpubHex,
        content: args,
      });
    } catch (e) {
      return { ok: false, reason: `build failed: ${(e as Error).message}` };
    }
    return this.signAndPublish(unsigned);
  }

  private async signAndPublish(
    unsigned: UnsignedEvent,
  ): Promise<PublishResult> {
    let signed: SignedEvent;
    try {
      // nostr-tools' finalizeEvent computes id + sig, returns a complete event.
      // The unsigned shape from @hashden/nostr matches what nostr-tools expects.
      signed = finalizeEvent(unsigned as any, this.secretKey) as SignedEvent;
    } catch (e) {
      return { ok: false, reason: `sign failed: ${(e as Error).message}` };
    }

    const results = await publishToRelays(signed, this.opts.relays);
    const oks = results.filter((r) => r.ok);
    if (oks.length === 0) {
      const reasons = results.map((r) => `${r.url}=${r.reason}`).join("; ");
      return { ok: false, reason: `all relays rejected: ${reasons}` };
    }
    return { ok: true, eventId: signed.id };
  }
}
