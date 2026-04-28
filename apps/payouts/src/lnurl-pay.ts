// LUD-16 Lightning-address → bolt11 resolution.
//
// Shared helper used by both LnbitsClient.payLightningAddress and
// NwcClient.payLightningAddress. Two HTTP round trips:
//   1. GET https://<host>/.well-known/lnurlp/<user> — metadata + callback URL
//   2. GET <callback>?amount=<msats> — bolt11 invoice for that amount
//
// Throws LnurlPayError on any failure (parse, range, timeout, HTTP).

export class LnurlPayError extends Error {
  constructor(
    message: string,
    readonly cause?:
      | { kind: "FORMAT" }
      | { kind: "TIMEOUT" }
      | { kind: "HTTP"; status: number }
      | { kind: "PARSE"; body: unknown }
      | { kind: "RANGE"; min: number; max: number; want: bigint },
  ) {
    super(message);
    this.name = "LnurlPayError";
  }
}

export interface LnurlPayMetadata {
  callback: string;
  minSendable: number;
  maxSendable: number;
  tag: string;
}

export interface ResolveOpts {
  fetchImpl?: typeof fetch;
  /** Per-request timeout (each of the two GETs gets this budget). */
  timeoutMs?: number;
}

const LN_ADDRESS_RE = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/;

export async function resolveLnurlPay(
  lightningAddress: string,
  sats: bigint,
  opts: ResolveOpts = {},
): Promise<string> {
  if (sats <= 0n) {
    throw new LnurlPayError("sats must be positive", { kind: "FORMAT" });
  }
  const m = lightningAddress.match(LN_ADDRESS_RE);
  if (!m) {
    throw new LnurlPayError(
      `invalid lightning address: ${lightningAddress}`,
      { kind: "FORMAT" },
    );
  }
  const [, user, host] = m;
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5_000;

  const meta = (await getJson(
    `https://${host}/.well-known/lnurlp/${encodeURIComponent(user!)}`,
    fetchFn,
    timeoutMs,
  )) as Partial<LnurlPayMetadata>;

  if (meta.tag !== "payRequest") {
    throw new LnurlPayError("LNURL-pay metadata not a payRequest", {
      kind: "PARSE",
      body: meta,
    });
  }
  if (typeof meta.callback !== "string") {
    throw new LnurlPayError("LNURL-pay metadata missing callback", {
      kind: "PARSE",
      body: meta,
    });
  }
  const minSendable = Number(meta.minSendable);
  const maxSendable = Number(meta.maxSendable);
  if (!Number.isFinite(minSendable) || !Number.isFinite(maxSendable)) {
    throw new LnurlPayError("LNURL-pay metadata missing sendable range", {
      kind: "PARSE",
      body: meta,
    });
  }
  const msats = sats * 1000n;
  if (msats < BigInt(minSendable) || msats > BigInt(maxSendable)) {
    throw new LnurlPayError(
      `amount ${msats}msat outside [${minSendable}, ${maxSendable}]`,
      { kind: "RANGE", min: minSendable, max: maxSendable, want: msats },
    );
  }

  const sep = meta.callback.includes("?") ? "&" : "?";
  const cbUrl = `${meta.callback}${sep}amount=${msats}`;
  const cb = (await getJson(cbUrl, fetchFn, timeoutMs)) as { pr?: string };
  if (typeof cb.pr !== "string") {
    throw new LnurlPayError("LNURL-pay callback returned no pr (bolt11)", {
      kind: "PARSE",
      body: cb,
    });
  }
  return cb.pr;
}

async function getJson(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { method: "GET", signal: ac.signal });
    if (!res.ok) {
      throw new LnurlPayError(`GET ${url} HTTP ${res.status}`, {
        kind: "HTTP",
        status: res.status,
      });
    }
    return await res.json();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new LnurlPayError(`GET ${url} timed out`, { kind: "TIMEOUT" });
    }
    if (err instanceof LnurlPayError) throw err;
    throw new LnurlPayError(
      `GET ${url} failed: ${(err as Error).message}`,
      { kind: "PARSE", body: err },
    );
  } finally {
    clearTimeout(timer);
  }
}
