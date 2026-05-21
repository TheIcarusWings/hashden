// Server-only NIP-57 zap helper: resolves the recipient's Lightning Address,
// posts the signed zap request to its LNURL callback, and returns the BOLT11.
//
// This is the same "voluntary project tip" model as the BTCPay donation flow —
// funds settle to the recipient's own wallet, never a platform balance.

import { nip19 } from "nostr-tools";

const ZAP_LIGHTNING_ADDRESS =
  process.env.ZAP_LIGHTNING_ADDRESS?.trim() || undefined;
const ZAP_NPUB = process.env.NEXT_PUBLIC_ZAP_NPUB?.trim() || undefined;

/** True only when both the recipient npub and its Lightning Address are set. */
export function zapConfigured(): boolean {
  return Boolean(ZAP_LIGHTNING_ADDRESS && ZAP_NPUB && zapRecipientHex());
}

/** Recipient pubkey (hex) decoded from the configured npub, or undefined. */
export function zapRecipientHex(): string | undefined {
  if (!ZAP_NPUB) return undefined;
  try {
    const d = nip19.decode(ZAP_NPUB);
    return d.type === "npub" ? d.data : undefined;
  } catch {
    return undefined;
  }
}

interface LnurlPayMetadata {
  tag?: string;
  callback?: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
  minSendable?: number;
  maxSendable?: number;
}

/**
 * Resolve the recipient's Lightning Address, confirm it supports NIP-57, and
 * fetch a BOLT11 for the given (already-signed) zap request. `amountMsat` must
 * match the request's `amount` tag.
 */
export async function requestZapInvoice(
  zapRequest: unknown,
  amountMsat: number,
): Promise<{ bolt11: string }> {
  if (!ZAP_LIGHTNING_ADDRESS) throw new Error("zap not configured");
  const [name, domain] = ZAP_LIGHTNING_ADDRESS.split("@");
  if (!name || !domain) throw new Error("invalid lightning address");

  const metaRes = await fetch(
    `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`,
    { cache: "no-store" },
  );
  if (!metaRes.ok) throw new Error(`LNURL lookup failed: ${metaRes.status}`);
  const meta = (await metaRes.json()) as LnurlPayMetadata;

  if (meta.tag !== "payRequest" || !meta.callback) {
    throw new Error("recipient is not a Lightning Address");
  }
  if (!meta.allowsNostr || !meta.nostrPubkey) {
    throw new Error("recipient does not support zaps");
  }
  if (
    (meta.minSendable != null && amountMsat < meta.minSendable) ||
    (meta.maxSendable != null && amountMsat > meta.maxSendable)
  ) {
    throw new Error("amount outside the recipient's allowed range");
  }

  const cb = new URL(meta.callback);
  cb.searchParams.set("amount", String(amountMsat));
  cb.searchParams.set("nostr", JSON.stringify(zapRequest));

  const invRes = await fetch(cb.toString(), { cache: "no-store" });
  if (!invRes.ok) throw new Error(`LNURL callback failed: ${invRes.status}`);
  const inv = (await invRes.json()) as { pr?: string; reason?: string };
  if (!inv.pr) throw new Error(inv.reason || "no invoice returned");
  return { bolt11: inv.pr };
}
