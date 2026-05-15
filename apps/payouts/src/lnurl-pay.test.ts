import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLnurlPay, LnurlPayError } from "./lnurl-pay.js";

function fakeFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("happy path: well-known + callback returns bolt11", async () => {
  const calls: string[] = [];
  const bolt11 = await resolveLnurlPay("alice@wallet.example", 5_000n, {
    fetchImpl: fakeFetch((url) => {
      calls.push(url);
      if (url.includes("/.well-known/lnurlp/alice")) {
        return jsonRes({
          tag: "payRequest",
          callback: "https://wallet.example/cb",
          minSendable: 1000,
          maxSendable: 1_000_000_000,
        });
      }
      if (url.startsWith("https://wallet.example/cb?amount=")) {
        return jsonRes({ pr: "lnbc-test-invoice" });
      }
      return new Response("unexpected", { status: 404 });
    }),
  });
  assert.equal(bolt11, "lnbc-test-invoice");
  // 5000 sats * 1000 = 5_000_000 msats
  assert.equal(calls[1], "https://wallet.example/cb?amount=5000000");
});

test("rejects below minSendable", async () => {
  await assert.rejects(
    resolveLnurlPay("alice@w.example", 1n, {
      fetchImpl: fakeFetch(() =>
        jsonRes({
          tag: "payRequest",
          callback: "https://w.example/cb",
          minSendable: 10_000_000, // 10k sats min
          maxSendable: 1_000_000_000,
        }),
      ),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "RANGE",
  );
});

test("rejects above maxSendable", async () => {
  await assert.rejects(
    resolveLnurlPay("alice@w.example", 100_000n, {
      fetchImpl: fakeFetch(() =>
        jsonRes({
          tag: "payRequest",
          callback: "https://w.example/cb",
          minSendable: 1000,
          maxSendable: 1_000_000, // 1k sats max
        }),
      ),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "RANGE",
  );
});

test("rejects malformed lightning address", async () => {
  await assert.rejects(
    resolveLnurlPay("not-an-address", 100n, {
      fetchImpl: fakeFetch(() => new Response("", { status: 200 })),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "FORMAT",
  );
});

test("rejects zero/negative sats", async () => {
  await assert.rejects(
    resolveLnurlPay("a@b.com", 0n, {
      fetchImpl: fakeFetch(() => new Response("", { status: 200 })),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "FORMAT",
  );
});

test("HTTP 5xx on metadata → LnurlPayError(HTTP)", async () => {
  await assert.rejects(
    resolveLnurlPay("a@b.example", 1000n, {
      fetchImpl: fakeFetch(() => new Response("nope", { status: 503 })),
    }),
    (err: any) =>
      err instanceof LnurlPayError &&
      err.cause?.kind === "HTTP" &&
      err.cause?.status === 503,
  );
});

test("non-payRequest tag → LnurlPayError(PARSE)", async () => {
  await assert.rejects(
    resolveLnurlPay("a@b.example", 1000n, {
      fetchImpl: fakeFetch(() =>
        jsonRes({ tag: "withdrawRequest", callback: "x" }),
      ),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "PARSE",
  );
});

test("callback returns no pr → LnurlPayError(PARSE)", async () => {
  await assert.rejects(
    resolveLnurlPay("a@b.example", 1000n, {
      fetchImpl: fakeFetch((url) => {
        if (url.includes("/.well-known/")) {
          return jsonRes({
            tag: "payRequest",
            callback: "https://b.example/cb",
            minSendable: 1000,
            maxSendable: 1_000_000_000,
          });
        }
        return jsonRes({ status: "ERROR", reason: "nope" });
      }),
    }),
    (err: any) =>
      err instanceof LnurlPayError && err.cause?.kind === "PARSE",
  );
});
