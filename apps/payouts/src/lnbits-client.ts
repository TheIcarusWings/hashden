// LNbits client for outgoing Lightning payments.
//
// Two payment paths:
//   1. payInvoice(bolt11) — direct bolt11 payment via /api/v1/payments
//   2. payLightningAddress(address, sats) — resolves the LNURL-pay
//      endpoint, asks for a bolt11 of the requested amount, then pays.
//
// We do not use LNbits' /payments/lnurl endpoint because it requires a
// LUD-16 LNURL string; passing a Lightning address (user@host) directly
// is more flexible and one less round-trip.
//
// Throws LnbitsError on any failure with a discriminated cause so the
// payout loop can decide (retry / mark FAILED / give up).

export interface LnbitsClientOpts {
  apiUrl: string; // e.g. "http://lnbits.example/api/v1"
  adminKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class LnbitsError extends Error {
  constructor(
    message: string,
    readonly cause: { kind: "TIMEOUT" } | { kind: "HTTP"; status: number; body: string } | { kind: "PARSE"; original: unknown },
  ) {
    super(message);
    this.name = "LnbitsError";
  }
}

export interface PaymentResult {
  /** Hex payment hash (proof-of-payment lookup key). */
  paymentHash: string;
  /** Optional preimage if available immediately. */
  preimage?: string;
}

export class LnbitsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: LnbitsClientOpts) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /**
   * Pays a bolt11 invoice and returns its payment hash.
   * Network errors / non-2xx responses throw LnbitsError so the payout
   * loop can mark the attempt FAILED with a typed reason.
   */
  async payInvoice(bolt11: string): Promise<PaymentResult> {
    const body = await this.post(`${this.opts.apiUrl}/payments`, {
      out: true,
      bolt11,
    });
    if (typeof body.payment_hash !== "string") {
      throw new LnbitsError("response missing payment_hash", {
        kind: "PARSE",
        original: body,
      });
    }
    return {
      paymentHash: body.payment_hash,
      preimage: typeof body.preimage === "string" ? body.preimage : undefined,
    };
  }

  /** Look up an LNbits payment by hash. Used at startup to recover
   *  IN_FLIGHT attempts after a crash mid-payment. */
  async getPaymentStatus(
    paymentHash: string,
  ): Promise<{ paid: boolean; pending: boolean }> {
    const res = await this.fetchWithTimeout(
      `${this.opts.apiUrl}/payments/${encodeURIComponent(paymentHash)}`,
      { method: "GET", headers: { "X-Api-Key": this.opts.adminKey } },
    );
    if (!res.ok) {
      throw new LnbitsError(`getPaymentStatus HTTP ${res.status}`, {
        kind: "HTTP",
        status: res.status,
        body: await res.text(),
      });
    }
    const json = (await res.json()) as { paid: boolean; pending: boolean };
    return { paid: !!json.paid, pending: !!json.pending };
  }

  /**
   * Resolves a Lightning address (user@host) into a bolt11 of the
   * requested sats amount, then pays it. Two HTTP round trips:
   *   1. GET https://host/.well-known/lnurlp/user → metadata + callback
   *   2. GET callback?amount=<msat> → bolt11
   * Then forwards to payInvoice().
   */
  async payLightningAddress(
    lightningAddress: string,
    sats: bigint,
  ): Promise<PaymentResult> {
    if (sats <= 0n) throw new LnbitsError("sats must be positive", {
      kind: "PARSE",
      original: sats,
    });
    const [user, host] = lightningAddress.split("@");
    if (!user || !host) {
      throw new LnbitsError(
        `invalid lightning address: ${lightningAddress}`,
        { kind: "PARSE", original: lightningAddress },
      );
    }
    const lnurlpUrl = `https://${host}/.well-known/lnurlp/${encodeURIComponent(user)}`;
    const meta = (await this.getJson(lnurlpUrl)) as {
      callback?: string;
      minSendable?: number;
      maxSendable?: number;
      tag?: string;
    };
    if (meta.tag !== "payRequest" || typeof meta.callback !== "string") {
      throw new LnbitsError("LNURL-pay metadata invalid", {
        kind: "PARSE",
        original: meta,
      });
    }
    const msats = sats * 1000n;
    if (
      typeof meta.minSendable === "number" &&
      msats < BigInt(meta.minSendable)
    ) {
      throw new LnbitsError(
        `amount ${msats}msat below minSendable ${meta.minSendable}`,
        { kind: "PARSE", original: meta },
      );
    }
    if (
      typeof meta.maxSendable === "number" &&
      msats > BigInt(meta.maxSendable)
    ) {
      throw new LnbitsError(
        `amount ${msats}msat above maxSendable ${meta.maxSendable}`,
        { kind: "PARSE", original: meta },
      );
    }
    const sep = meta.callback.includes("?") ? "&" : "?";
    const cbUrl = `${meta.callback}${sep}amount=${msats}`;
    const cb = (await this.getJson(cbUrl)) as { pr?: string; status?: string };
    if (typeof cb.pr !== "string") {
      throw new LnbitsError("LNURL callback returned no pr (bolt11)", {
        kind: "PARSE",
        original: cb,
      });
    }
    return this.payInvoice(cb.pr);
  }

  private async post(url: string, body: unknown): Promise<any> {
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Api-Key": this.opts.adminKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new LnbitsError(`POST ${url} HTTP ${res.status}`, {
        kind: "HTTP",
        status: res.status,
        body: await res.text(),
      });
    }
    return await res.json();
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchWithTimeout(url, { method: "GET" });
    if (!res.ok) {
      throw new LnbitsError(`GET ${url} HTTP ${res.status}`, {
        kind: "HTTP",
        status: res.status,
        body: await res.text(),
      });
    }
    return await res.json();
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: ac.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new LnbitsError(`request to ${url} timed out`, {
          kind: "TIMEOUT",
        });
      }
      throw new LnbitsError(`fetch ${url} failed: ${(err as Error).message}`, {
        kind: "PARSE",
        original: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
