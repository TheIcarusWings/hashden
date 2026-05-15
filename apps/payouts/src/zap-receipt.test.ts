import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZapReceiptEvent } from "./zap-receipt.js";

const PROJ = "ab".repeat(32);
const RECIPIENT = "cd".repeat(32);
const BLOCK_EVT = "ef".repeat(32);
const BLOCK_HASH = "12".repeat(32);

test("ON_CHAIN_COINBASE: required tags + amount in millisats", () => {
  const e = buildZapReceiptEvent({
    projectPubkey: PROJ,
    recipientPubkey: RECIPIENT,
    amountSats: "76171875",
    blockEventId: BLOCK_EVT,
    blockHash: BLOCK_HASH,
    kind: "ON_CHAIN_COINBASE",
    createdAt: 1700000000,
  });
  assert.equal(e.kind, 9735);
  assert.equal(e.pubkey, PROJ);
  const tag = (k: string) => e.tags.find((t) => t[0] === k);
  assert.deepEqual(tag("p"), ["p", RECIPIENT]);
  assert.deepEqual(tag("e"), ["e", BLOCK_EVT]);
  // 76_171_875 sats * 1000 = 76_171_875_000 msats
  assert.deepEqual(tag("amount"), ["amount", "76171875000"]);
  assert.deepEqual(tag("payout_kind"), ["payout_kind", "ON_CHAIN_COINBASE"]);
  assert.deepEqual(tag("block"), ["block", BLOCK_HASH]);
  assert.equal(tag("bolt11"), undefined);
});

test("LN_DUST: includes bolt11 + payment_hash tags", () => {
  const e = buildZapReceiptEvent({
    projectPubkey: PROJ,
    recipientPubkey: RECIPIENT,
    amountSats: "5000",
    blockEventId: BLOCK_EVT,
    kind: "LN_DUST",
    bolt11: "lnbc50u1p3...",
    paymentHash: "01".repeat(32),
  });
  const tag = (k: string) => e.tags.find((t) => t[0] === k);
  assert.deepEqual(tag("payout_kind"), ["payout_kind", "LN_DUST"]);
  assert.deepEqual(tag("bolt11"), ["bolt11", "lnbc50u1p3..."]);
  assert.deepEqual(tag("preimage_hash"), ["preimage_hash", "01".repeat(32)]);
});

test("content summary differentiates kinds", () => {
  const onchain = buildZapReceiptEvent({
    projectPubkey: PROJ,
    recipientPubkey: RECIPIENT,
    amountSats: "1000",
    blockEventId: BLOCK_EVT,
    kind: "ON_CHAIN_COINBASE",
  });
  assert.match(onchain.content, /on-chain coinbase/);
  const dust = buildZapReceiptEvent({
    projectPubkey: PROJ,
    recipientPubkey: RECIPIENT,
    amountSats: "100",
    blockEventId: BLOCK_EVT,
    kind: "LN_DUST",
  });
  assert.match(dust.content, /dust fan-out/);
});

test("rejects invalid project pubkey", () => {
  assert.throws(() =>
    buildZapReceiptEvent({
      projectPubkey: "not-a-pubkey",
      recipientPubkey: RECIPIENT,
      amountSats: "1",
      blockEventId: BLOCK_EVT,
      kind: "LN_DUST",
    }),
  );
});

test("rejects invalid recipient pubkey", () => {
  assert.throws(() =>
    buildZapReceiptEvent({
      projectPubkey: PROJ,
      recipientPubkey: "abc",
      amountSats: "1",
      blockEventId: BLOCK_EVT,
      kind: "LN_DUST",
    }),
  );
});

test("rejects non-numeric amountSats", () => {
  assert.throws(() =>
    buildZapReceiptEvent({
      projectPubkey: PROJ,
      recipientPubkey: RECIPIENT,
      amountSats: "1.5",
      blockEventId: BLOCK_EVT,
      kind: "LN_DUST",
    }),
  );
});

test("rejects invalid blockEventId", () => {
  assert.throws(() =>
    buildZapReceiptEvent({
      projectPubkey: PROJ,
      recipientPubkey: RECIPIENT,
      amountSats: "1",
      blockEventId: "short",
      kind: "LN_DUST",
    }),
  );
});

test("app=hashden tag always present", () => {
  const e = buildZapReceiptEvent({
    projectPubkey: PROJ,
    recipientPubkey: RECIPIENT,
    amountSats: "1",
    blockEventId: BLOCK_EVT,
    kind: "LN_DUST",
  });
  assert.deepEqual(
    e.tags.find((t) => t[0] === "app"),
    ["app", "hashden"],
  );
});
