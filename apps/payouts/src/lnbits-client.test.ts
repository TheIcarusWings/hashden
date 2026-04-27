import { test } from "node:test";
import assert from "node:assert/strict";
import { LnbitsClient, LnbitsError } from "./lnbits-client.js";

interface FakeFetchHandler {
  (req: { url: string; method: string; body: unknown; headers: Headers }): Response | Promise<Response>;
}

function fakeFetch(handler: FakeFetchHandler): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    return handler({
      url,
      method: init?.method ?? "GET",
      body,
      headers: new Headers(init?.headers),
    });
  }) as typeof fetch;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("payInvoice: posts bolt11 with admin key + returns paymentHash", async () => {
  let captured: { url: string; method: string; body: any; headers: Headers } | null = null;
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "admin-secret",
    fetchImpl: fakeFetch((req) => {
      captured = req;
      return jsonRes({ payment_hash: "deadbeef".repeat(8), preimage: "pre" });
    }),
  });
  const r = await c.payInvoice("lnbc50u1p3...");
  assert.equal(captured!.url, "http://lnbits/api/v1/payments");
  assert.equal(captured!.method, "POST");
  assert.equal(captured!.headers.get("X-Api-Key"), "admin-secret");
  assert.equal(captured!.body.bolt11, "lnbc50u1p3...");
  assert.equal(captured!.body.out, true);
  assert.equal(r.paymentHash, "deadbeef".repeat(8));
  assert.equal(r.preimage, "pre");
});

test("payInvoice: HTTP error throws LnbitsError(HTTP)", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(() => new Response("nope", { status: 500 })),
  });
  await assert.rejects(c.payInvoice("lnbc1..."), (err: any) => {
    return err instanceof LnbitsError && err.cause.kind === "HTTP" && err.cause.status === 500;
  });
});

test("payInvoice: missing payment_hash → LnbitsError(PARSE)", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(() => jsonRes({ unrelated: "field" })),
  });
  await assert.rejects(c.payInvoice("lnbc1..."), (err: any) => {
    return err instanceof LnbitsError && err.cause.kind === "PARSE";
  });
});

test("getPaymentStatus: GET with admin key + parses paid/pending", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(({ method, url }) => {
      assert.equal(method, "GET");
      assert.match(url, /\/payments\//);
      return jsonRes({ paid: true, pending: false });
    }),
  });
  const r = await c.getPaymentStatus("hash");
  assert.equal(r.paid, true);
  assert.equal(r.pending, false);
});

test("payLightningAddress: resolves LNURL-pay then calls payInvoice", async () => {
  const calls: string[] = [];
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(({ url }) => {
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
        return jsonRes({ pr: "lnbc-from-callback" });
      }
      // payInvoice
      if (url === "http://lnbits/api/v1/payments") {
        return jsonRes({ payment_hash: "ab".repeat(32) });
      }
      return new Response("unexpected", { status: 404 });
    }),
  });
  const r = await c.payLightningAddress("alice@wallet.example", 5_000n);
  assert.equal(r.paymentHash, "ab".repeat(32));
  assert.equal(calls.length, 3);
  assert.equal(calls[0], "https://wallet.example/.well-known/lnurlp/alice");
  // 5_000 sats * 1000 = 5_000_000 msats
  assert.equal(calls[1], "https://wallet.example/cb?amount=5000000");
});

test("payLightningAddress: rejects below minSendable", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(() =>
      jsonRes({
        tag: "payRequest",
        callback: "https://w.example/cb",
        minSendable: 10_000_000, // 10_000 sats minimum
        maxSendable: 1_000_000_000,
      }),
    ),
  });
  await assert.rejects(
    c.payLightningAddress("alice@w.example", 100n),
    /below minSendable/,
  );
});

test("payLightningAddress: rejects above maxSendable", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(() =>
      jsonRes({
        tag: "payRequest",
        callback: "https://w.example/cb",
        minSendable: 1000,
        maxSendable: 1_000_000, // 1000 sats max
      }),
    ),
  });
  await assert.rejects(
    c.payLightningAddress("alice@w.example", 100_000n),
    /above maxSendable/,
  );
});

test("payLightningAddress: rejects malformed address", async () => {
  const c = new LnbitsClient({
    apiUrl: "http://lnbits/api/v1",
    adminKey: "k",
    fetchImpl: fakeFetch(() => new Response("", { status: 200 })),
  });
  await assert.rejects(
    c.payLightningAddress("not-an-address", 100n),
    /invalid lightning address/,
  );
});
