import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNwcUri, NwcError } from "./nwc-client.js";

const VALID_PUBKEY = "ab".repeat(32);
const VALID_SECRET = "cd".repeat(32);

test("parseNwcUri: nostr+walletconnect:// scheme", () => {
  const r = parseNwcUri(
    `nostr+walletconnect://${VALID_PUBKEY}?relay=wss://relay.example.com&secret=${VALID_SECRET}`,
  );
  assert.equal(r.walletPubkey, VALID_PUBKEY);
  assert.equal(r.relayUrl, "wss://relay.example.com");
  assert.equal(r.secretHex, VALID_SECRET);
});

test("parseNwcUri: legacy nostrwalletconnect:// scheme", () => {
  const r = parseNwcUri(
    `nostrwalletconnect://${VALID_PUBKEY}?relay=wss://r.example&secret=${VALID_SECRET}`,
  );
  assert.equal(r.walletPubkey, VALID_PUBKEY);
});

test("parseNwcUri: URL-encoded relay decodes correctly", () => {
  const r = parseNwcUri(
    `nostr+walletconnect://${VALID_PUBKEY}?relay=${encodeURIComponent("wss://relay.example.com/?token=xyz")}&secret=${VALID_SECRET}`,
  );
  assert.equal(r.relayUrl, "wss://relay.example.com/?token=xyz");
});

test("parseNwcUri: trims and lowercases pubkey hex", () => {
  const r = parseNwcUri(
    `  nostr+walletconnect://${VALID_PUBKEY.toUpperCase()}?relay=wss://r.example&secret=${VALID_SECRET.toUpperCase()}  `,
  );
  assert.equal(r.walletPubkey, VALID_PUBKEY);
  assert.equal(r.secretHex, VALID_SECRET);
});

test("parseNwcUri: missing scheme → URI error", () => {
  assert.throws(
    () =>
      parseNwcUri(
        `${VALID_PUBKEY}?relay=wss://r.example&secret=${VALID_SECRET}`,
      ),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});

test("parseNwcUri: missing relay → URI error", () => {
  assert.throws(
    () => parseNwcUri(`nostr+walletconnect://${VALID_PUBKEY}?secret=${VALID_SECRET}`),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});

test("parseNwcUri: missing secret → URI error", () => {
  assert.throws(
    () =>
      parseNwcUri(
        `nostr+walletconnect://${VALID_PUBKEY}?relay=wss://r.example`,
      ),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});

test("parseNwcUri: short pubkey → URI error", () => {
  assert.throws(
    () =>
      parseNwcUri(
        `nostr+walletconnect://abcd?relay=wss://r&secret=${VALID_SECRET}`,
      ),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});

test("parseNwcUri: short secret → URI error", () => {
  assert.throws(
    () =>
      parseNwcUri(
        `nostr+walletconnect://${VALID_PUBKEY}?relay=wss://r&secret=cafebabe`,
      ),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});

test("parseNwcUri: missing query string → URI error", () => {
  assert.throws(
    () => parseNwcUri(`nostr+walletconnect://${VALID_PUBKEY}`),
    (err: any) => err instanceof NwcError && err.cause?.kind === "URI",
  );
});
