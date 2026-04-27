import { test } from "node:test";
import assert from "node:assert/strict";
import { BitcoinRpcClient } from "./rpc-client.js";
import { BitcoinRpcError } from "./types.js";

function fakeFetch(handler: (req: { url: string; body: unknown; headers: Headers }) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    const headers = new Headers(init?.headers);
    return await handler({ url, body, headers });
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("getBlockCount: parses int", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(({ body }) => {
      assert.equal((body as any).method, "getblockcount");
      return jsonResponse({ result: 946926, error: null, id: "hashden" });
    }),
  });
  assert.equal(await c.getBlockCount(), 946926);
});

test("getBlockTemplate: maps required fields and preserves raw", async () => {
  const raw = {
    height: 946927,
    coinbasevalue: 313_000_000,
    bits: "17021369",
    previousblockhash: "00".repeat(32),
    target: "00".repeat(32),
    mintime: 1777322000,
    transactions: [],
    extra_field_we_dont_model: "preserved",
  };
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(() =>
      jsonResponse({ result: raw, error: null, id: "hashden" }),
    ),
  });
  const t = await c.getBlockTemplate();
  assert.equal(t.height, 946927);
  assert.equal(t.coinbasevalue, 313_000_000);
  assert.equal(t.bits, "17021369");
  // Preserved passthrough
  assert.equal((t.raw as any).extra_field_we_dont_model, "preserved");
});

test("getBlockTemplate: missing required fields → BitcoinRpcError(PARSE)", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(() =>
      jsonResponse({
        result: { height: "not-a-number" },
        error: null,
        id: "hashden",
      }),
    ),
  });
  await assert.rejects(c.getBlockTemplate(), (err: any) => {
    return err instanceof BitcoinRpcError && err.cause?.kind === "PARSE";
  });
});

test("call: authorization header has Basic <b64(user:pass)>", async () => {
  let capturedAuth: string | null = null;
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "umbrel:secret",
    fetchImpl: fakeFetch(({ headers }) => {
      capturedAuth = headers.get("authorization");
      return jsonResponse({ result: 0, error: null, id: "hashden" });
    }),
  });
  await c.getBlockCount();
  assert.equal(capturedAuth, `Basic ${Buffer.from("umbrel:secret").toString("base64")}`);
});

test("call: HTTP error → BitcoinRpcError(HTTP) with status", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(() => new Response("nope", { status: 503 })),
  });
  await assert.rejects(c.getBlockCount(), (err: any) => {
    return err instanceof BitcoinRpcError && err.cause?.kind === "HTTP" && err.cause?.status === 503;
  });
});

test("call: RPC error in body → BitcoinRpcError(RPC)", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(() =>
      jsonResponse({
        result: null,
        error: { code: -32601, message: "Method not found" },
        id: "hashden",
      }),
    ),
  });
  await assert.rejects(c.getBlockCount(), (err: any) => {
    return err instanceof BitcoinRpcError && err.cause?.kind === "RPC" && err.cause?.error?.code === -32601;
  });
});

test("call: timeout aborts and throws TIMEOUT", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    timeoutMs: 50,
    fetchImpl: ((_input: any, init: any) => {
      // Fetch that never resolves until aborted
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as typeof fetch,
  });
  const t0 = Date.now();
  await assert.rejects(c.getBlockCount(), (err: any) => {
    return err instanceof BitcoinRpcError && err.cause?.kind === "TIMEOUT";
  });
  const elapsed = Date.now() - t0;
  // Should have aborted close to the 50ms threshold (allow up to 500ms slop on slow CI).
  assert.ok(elapsed < 500, `timeout took ${elapsed}ms, should be ~50ms`);
});

test("call: invalid JSON body → BitcoinRpcError(PARSE)", async () => {
  const c = new BitcoinRpcClient({
    url: "http://test/",
    auth: "u:p",
    fetchImpl: fakeFetch(() =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ),
  });
  await assert.rejects(c.getBlockCount(), (err: any) => {
    return err instanceof BitcoinRpcError && err.cause?.kind === "PARSE";
  });
});
