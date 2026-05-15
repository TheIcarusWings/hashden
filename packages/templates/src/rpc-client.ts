// Minimal Bitcoin RPC client built on top of fetch.
//
// We avoid pulling in `rpc-bitcoin` or similar full clients because the
// stratum already has its own (in apps/stratum) and we want this package
// to stay dependency-free for testability + cross-app reuse. fetch() is
// built into Node 20+.
//
// Two failure modes the caller cares about:
//   - TIMEOUT (network slow / unreachable) → drives auto-fallback
//   - RPC error (Bitcoin Core returned a JSON-RPC error) → caller decides

import {
  type BlockTemplate,
  BitcoinRpcError,
  type RpcError,
} from "./types.js";

export interface RpcClientOptions {
  /** Full URL like `http://100.98.39.42:9332/`. Trailing slash optional. */
  url: string;
  /** HTTP basic auth credentials, format `user:pass`. */
  auth: string;
  /** Per-call timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Optional fetch override for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

export class BitcoinRpcClient {
  constructor(private readonly opts: RpcClientOptions) {}

  /**
   * Calls `getblocktemplate` and normalizes the response. Returns the
   * fields hashden cares about + a `raw` passthrough.
   *
   * `rules` is the BIP9 segwit/etc rules array, default `["segwit"]` per
   * Bitcoin Core conventions.
   */
  async getBlockTemplate(rules: string[] = ["segwit"]): Promise<BlockTemplate> {
    const result = await this.call<RawTemplate>("getblocktemplate", [
      { rules },
    ]);
    if (
      typeof result.height !== "number" ||
      typeof result.coinbasevalue !== "number"
    ) {
      throw new BitcoinRpcError(
        "getblocktemplate response missing required fields",
        { kind: "PARSE", original: result },
      );
    }
    return {
      height: result.height,
      coinbasevalue: result.coinbasevalue,
      bits: result.bits,
      previousblockhash: result.previousblockhash,
      target: result.target,
      mintime: result.mintime,
      transactions: Array.isArray(result.transactions)
        ? result.transactions
        : [],
      default_witness_commitment: result.default_witness_commitment,
      raw: result,
    };
  }

  /** Convenience: fetch tip height. Cheap; useful for health checks. */
  async getBlockCount(): Promise<number> {
    return this.call<number>("getblockcount", []);
  }

  /** Generic RPC call. Public for callers that need other methods. */
  async call<T>(method: string, params: unknown[]): Promise<T> {
    const fetchFn = this.opts.fetchImpl ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? 5000;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(this.opts.url, {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          authorization: `Basic ${base64(this.opts.auth)}`,
        },
        body: JSON.stringify({
          jsonrpc: "1.0",
          id: "hashden",
          method,
          params,
        }),
        signal: ac.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new BitcoinRpcError(
          `RPC ${method} timed out after ${timeoutMs}ms`,
          { kind: "TIMEOUT" },
        );
      }
      throw new BitcoinRpcError(
        `RPC ${method} network error: ${(err as Error).message}`,
        { kind: "PARSE", original: err },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new BitcoinRpcError(
        `RPC ${method} HTTP ${response.status}`,
        { kind: "HTTP", status: response.status },
      );
    }

    let body: { result: T; error: RpcError | null };
    try {
      body = (await response.json()) as typeof body;
    } catch (err) {
      throw new BitcoinRpcError(
        `RPC ${method} invalid JSON response`,
        { kind: "PARSE", original: err },
      );
    }
    if (body.error) {
      throw new BitcoinRpcError(
        `RPC ${method} error: ${body.error.message}`,
        { kind: "RPC", error: body.error },
      );
    }
    return body.result;
  }
}

interface RawTemplate {
  height: number;
  coinbasevalue: number;
  bits: string;
  previousblockhash: string;
  target: string;
  mintime: number;
  transactions: unknown;
  default_witness_commitment?: string;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
