import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkerName } from "./worker-name.js";

const VALID_PUBKEY =
  "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

// NIP-19 spec example npub → its corresponding hex.
const SAMPLE_NPUB =
  "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg";
const SAMPLE_NPUB_HEX =
  "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e";

test("parses slug + pubkey + worker id", () => {
  const r = parseWorkerName(`demo.${VALID_PUBKEY}.bitaxe-01`);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.slug, "demo");
    assert.equal(r.memberPubkey, VALID_PUBKEY);
    assert.equal(r.workerId, "bitaxe-01");
  }
});

test("parses slug + pubkey without worker id", () => {
  const r = parseWorkerName(`demo.${VALID_PUBKEY}`);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.workerId, null);
  }
});

test("rejects missing pubkey", () => {
  const r = parseWorkerName("demo");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "MISSING_PUBKEY");
});

test("rejects empty input", () => {
  assert.equal(parseWorkerName("").ok, false);
  assert.equal(parseWorkerName(undefined).ok, false);
  assert.equal(parseWorkerName(null).ok, false);
});

test("rejects too many parts", () => {
  const r = parseWorkerName(`demo.${VALID_PUBKEY}.worker.extra`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "TOO_MANY_PARTS");
});

test("rejects invalid slug — uppercase", () => {
  const r = parseWorkerName(`Demo.${VALID_PUBKEY}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_SLUG");
});

test("rejects invalid slug — leading dash", () => {
  const r = parseWorkerName(`-demo.${VALID_PUBKEY}`);
  assert.equal(r.ok, false);
});

test("rejects invalid pubkey — wrong length", () => {
  const r = parseWorkerName(`demo.abc123`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_PUBKEY");
});

test("rejects invalid pubkey — non-hex chars", () => {
  const r = parseWorkerName(
    `demo.zz${VALID_PUBKEY.slice(2)}`,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_PUBKEY");
});

test("rejects invalid worker id with disallowed chars", () => {
  const r = parseWorkerName(`demo.${VALID_PUBKEY}.bad/worker`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_WORKER_ID");
});

test("accepts maximum-length valid slug", () => {
  const slug = "a" + "b".repeat(61) + "c";  // 63 chars
  const r = parseWorkerName(`${slug}.${VALID_PUBKEY}`);
  assert.equal(r.ok, true);
});

test("parses npub bech32 form, returns hex internally", () => {
  const r = parseWorkerName(`demo.${SAMPLE_NPUB}.bitaxe-01`);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.slug, "demo");
    assert.equal(r.memberPubkey, SAMPLE_NPUB_HEX);
    assert.equal(r.workerId, "bitaxe-01");
  }
});

test("parses npub bech32 without worker id", () => {
  const r = parseWorkerName(`demo.${SAMPLE_NPUB}`);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.memberPubkey, SAMPLE_NPUB_HEX);
    assert.equal(r.workerId, null);
  }
});

test("rejects npub with bad checksum (bech32 verify catches it)", () => {
  // Flip one char in the data portion of SAMPLE_NPUB so checksum fails.
  const broken =
    "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptq";
  const r = parseWorkerName(`demo.${broken}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_PUBKEY");
});

test("rejects nsec1 in pubkey slot (private key shouldn't be auth material)", () => {
  // NIP-19 spec example test vector, not a real key.
  const nsec = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"; // gitleaks:allow
  const r = parseWorkerName(`demo.${nsec}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_PUBKEY");
});
