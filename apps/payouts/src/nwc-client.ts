// NIP-47 Nostr Wallet Connect client.
//
// Operators using NWC-compatible wallets (Alby Hub, Mutiny, etc.) paste
// a connection URI into their group settings. The URI carries:
//   - the wallet's pubkey (hex)
//   - a relay URL
//   - a "secret" — actually a private key the wallet has authorized to
//     issue requests on its behalf, scoped to whatever permissions the
//     operator chose
//
// Format: `nostr+walletconnect://<wallet-pubkey>?relay=<url>&secret=<hex>`
// (also accepts the legacy `nostrwalletconnect://` scheme).
//
// Protocol (NIP-47):
//   - Request: kind 23194, content = NIP-04 encrypted JSON, p-tag = wallet
//   - Response: kind 23195, content = NIP-04 encrypted JSON, p-tag = us,
//     e-tag = our request event id
//
// Methods used by hashden's payouts worker:
//   - pay_invoice — main path; takes bolt11, returns preimage + hash
//   - lookup_invoice — for IN_FLIGHT crash recovery (paymentHash lookup)

import { Relay } from "nostr-tools/relay";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import type { LnClient, PaymentResult, PaymentStatus } from "./ln-client.js";
import { resolveLnurlPay } from "./lnurl-pay.js";

export class NwcError extends Error {
  constructor(
    message: string,
    readonly cause?:
      | { kind: "URI" }
      | { kind: "TIMEOUT" }
      | { kind: "RELAY"; url: string; reason: string }
      | { kind: "DECRYPT" }
      | { kind: "WALLET"; code?: string },
  ) {
    super(message);
    this.name = "NwcError";
  }
}

export interface NwcConnection {
  walletPubkey: string;
  relayUrl: string;
  secretHex: string;
}

export function parseNwcUri(uri: string): NwcConnection {
  const trimmed = uri.trim();
  // Accept both `nostr+walletconnect:` and legacy `nostrwalletconnect:`.
  const cleaned = trimmed
    .replace(/^nostr\+walletconnect:\/\//, "")
    .replace(/^nostrwalletconnect:\/\//, "")
    .replace(/^nostr\+walletconnect:/, "")
    .replace(/^nostrwalletconnect:/, "");
  if (cleaned === trimmed) {
    throw new NwcError("URI must start with nostr+walletconnect://", {
      kind: "URI",
    });
  }
  const qIdx = cleaned.indexOf("?");
  if (qIdx < 0) {
    throw new NwcError("URI missing query string (relay + secret)", {
      kind: "URI",
    });
  }
  const walletPubkey = cleaned.slice(0, qIdx).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(walletPubkey)) {
    throw new NwcError("URI wallet pubkey must be 64 hex chars", {
      kind: "URI",
    });
  }
  const params = new URLSearchParams(cleaned.slice(qIdx + 1));
  const relayUrl = params.get("relay");
  const secretHex = params.get("secret");
  if (!relayUrl) {
    throw new NwcError("URI missing relay parameter", { kind: "URI" });
  }
  if (!secretHex || !/^[0-9a-f]{64}$/i.test(secretHex)) {
    throw new NwcError(
      "URI missing or invalid secret parameter (64 hex chars)",
      { kind: "URI" },
    );
  }
  return {
    walletPubkey,
    relayUrl: decodeURIComponent(relayUrl),
    secretHex: secretHex.toLowerCase(),
  };
}

export interface NwcClientOpts {
  /** Per-request timeout (publish + response). Defaults to 30s. */
  requestTimeoutMs?: number;
  /** Override Relay.connect for tests. */
  relayConnect?: (url: string) => Promise<RelayLike>;
}

/** The minimum subset of nostr-tools' Relay we use; lets tests stub it. */
export interface RelayLike {
  publish(event: any): Promise<unknown>;
  subscribe(
    filters: any[],
    handlers: { onevent?: (event: any) => void; oneose?: () => void },
  ): { close(): void };
  close(): void;
}

interface NwcRequest {
  method: string;
  params: Record<string, unknown>;
}

interface NwcResponse {
  result_type?: string;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

export class NwcClient implements LnClient {
  private readonly walletPubkey: string;
  private readonly relayUrl: string;
  private readonly secretHex: string;
  private readonly secret: Uint8Array;
  private readonly clientPubkey: string;
  private readonly requestTimeoutMs: number;
  private readonly relayConnect: (url: string) => Promise<RelayLike>;

  constructor(connectionUri: string, opts: NwcClientOpts = {}) {
    const parsed = parseNwcUri(connectionUri);
    this.walletPubkey = parsed.walletPubkey;
    this.relayUrl = parsed.relayUrl;
    this.secretHex = parsed.secretHex;
    this.secret = hexToBytes(parsed.secretHex);
    this.clientPubkey = getPublicKey(this.secret);
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.relayConnect =
      opts.relayConnect ??
      (async (url: string) => (await Relay.connect(url)) as unknown as RelayLike);
  }

  /** Pays a bolt11 invoice. Returns the payment hash + optional preimage. */
  async payInvoice(bolt11: string): Promise<PaymentResult> {
    const response = await this.sendRequest({
      method: "pay_invoice",
      params: { invoice: bolt11 },
    });
    if (response.error) {
      throw new NwcError(
        `pay_invoice failed: ${response.error.message ?? response.error.code ?? "unknown"}`,
        { kind: "WALLET", code: response.error.code },
      );
    }
    const result = response.result ?? {};
    const paymentHash =
      typeof result.payment_hash === "string"
        ? (result.payment_hash as string)
        : "";
    const preimage =
      typeof result.preimage === "string"
        ? (result.preimage as string)
        : undefined;
    return { paymentHash, preimage };
  }

  async payLightningAddress(
    lightningAddress: string,
    sats: bigint,
  ): Promise<PaymentResult> {
    const bolt11 = await resolveLnurlPay(lightningAddress, sats);
    return this.payInvoice(bolt11);
  }

  /** Look up an invoice by payment hash. Used by reconcileInFlight after
   *  a worker crash to determine whether the payment actually completed.
   *  Maps NWC's `lookup_invoice` to our PaymentStatus shape. */
  async getPaymentStatus(paymentHash: string): Promise<PaymentStatus> {
    const response = await this.sendRequest({
      method: "lookup_invoice",
      params: { payment_hash: paymentHash },
    });
    if (response.error) {
      // NOT_FOUND on lookup is reasonable to treat as "not paid, not pending"
      // — caller's reconciler will mark FAILED. Other errors throw.
      if (response.error.code === "NOT_FOUND") {
        return { paid: false, pending: false };
      }
      throw new NwcError(
        `lookup_invoice failed: ${response.error.message ?? response.error.code ?? "unknown"}`,
        { kind: "WALLET", code: response.error.code },
      );
    }
    const result = response.result ?? {};
    const settled =
      result.settled_at != null || result.preimage != null;
    return {
      paid: !!settled,
      pending: !settled,
    };
  }

  private async sendRequest(req: NwcRequest): Promise<NwcResponse> {
    const relay = await this.relayConnect(this.relayUrl).catch((err) => {
      throw new NwcError(`relay connect failed: ${(err as Error).message}`, {
        kind: "RELAY",
        url: this.relayUrl,
        reason: (err as Error).message,
      });
    });

    try {
      // NIP-04 encrypt the request payload to the wallet's pubkey.
      const ct = await nip04.encrypt(
        this.secretHex,
        this.walletPubkey,
        JSON.stringify(req),
      );

      // Build, sign, and publish the kind-23194 request event.
      const unsigned = {
        kind: 23194,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.walletPubkey]],
        content: ct,
      };
      const signed = finalizeEvent(unsigned as any, this.secret);

      // Subscribe BEFORE publishing so we don't miss a fast response.
      const responsePromise = new Promise<NwcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          sub.close();
          reject(
            new NwcError(
              `NWC ${req.method} timed out after ${this.requestTimeoutMs}ms`,
              { kind: "TIMEOUT" },
            ),
          );
        }, this.requestTimeoutMs);

        const sub = relay.subscribe(
          [
            {
              kinds: [23195],
              "#e": [signed.id],
              "#p": [this.clientPubkey],
            },
          ],
          {
            onevent: async (ev: any) => {
              try {
                const ptText = await nip04.decrypt(
                  this.secretHex,
                  this.walletPubkey,
                  ev.content,
                );
                clearTimeout(timer);
                sub.close();
                let parsed: NwcResponse;
                try {
                  parsed = JSON.parse(ptText);
                } catch (e) {
                  reject(
                    new NwcError(
                      `NWC response parse failed: ${(e as Error).message}`,
                      { kind: "DECRYPT" },
                    ),
                  );
                  return;
                }
                resolve(parsed);
              } catch (e) {
                clearTimeout(timer);
                sub.close();
                reject(
                  new NwcError(
                    `NWC response decrypt failed: ${(e as Error).message}`,
                    { kind: "DECRYPT" },
                  ),
                );
              }
            },
          },
        );
      });

      await relay.publish(signed);
      return await responsePromise;
    } finally {
      try {
        relay.close();
      } catch {
        /* swallow close errors */
      }
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
