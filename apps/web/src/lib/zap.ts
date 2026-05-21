// Client-safe helpers for Nostr zaps (NIP-57). The zap *request* (kind 9734)
// is built here and signed by the donor's NIP-07 extension; the LNURL exchange
// happens server-side via /api/zap (avoids CORS, centralizes recipient config).

import { nip19 } from "nostr-tools";
import type { UnsignedEvent } from "@hashden/nostr";

/** Decode an npub to a 64-char hex pubkey. Throws on anything else. */
export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") throw new Error("not an npub");
  return decoded.data;
}

/**
 * Build an unsigned NIP-57 zap request (kind 9734) for a *profile* zap (no
 * event tag). The LNURL server validates the signature, the `p` tag, and that
 * the `amount` tag matches the callback amount, then publishes the receipt to
 * the listed relays.
 */
export function buildZapRequest(opts: {
  recipientHex: string;
  amountMsat: number;
  relays: string[];
}): UnsignedEvent {
  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      ["relays", ...opts.relays],
      ["amount", String(opts.amountMsat)],
      ["p", opts.recipientHex],
    ],
  };
}

export interface ZapInvoice {
  /** BOLT11 invoice to pay (raw, no `lightning:` prefix). */
  bolt11: string;
  /** Pre-rendered QR (encodes `lightning:<bolt11>`) as a PNG data URL. */
  qrDataUrl: string;
}

/** Exchange a signed zap request for a BOLT11 via our server route. */
export async function createZap(signedZapRequest: unknown): Promise<ZapInvoice> {
  const res = await fetch("/api/zap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ zapRequest: signedZapRequest }),
  });
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(msg || `Zap request failed (${res.status})`);
  }
  return (await res.json()) as ZapInvoice;
}
