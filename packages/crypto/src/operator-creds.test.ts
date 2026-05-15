import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptOperatorCred,
  decryptOperatorCred,
  parseMasterKey,
  isEncryptedWire,
  OperatorCredsCryptoError,
} from "./operator-creds.js";

const KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY = parseMasterKey(KEY_HEX);

test("round-trip: encrypt → decrypt yields the same plaintext", () => {
  const plaintext = "lnbits-admin-key-secret-12345";
  const wire = encryptOperatorCred(plaintext, KEY);
  assert.equal(decryptOperatorCred(wire, KEY), plaintext);
});

test("encrypted wire has v1: prefix and 4 colon-separated parts", () => {
  const wire = encryptOperatorCred("anything", KEY);
  const parts = wire.split(":");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "v1");
});

test("two encryptions of the same plaintext produce different wires (random IV)", () => {
  const a = encryptOperatorCred("same", KEY);
  const b = encryptOperatorCred("same", KEY);
  assert.notEqual(a, b);
});

test("decrypt with wrong key throws AUTH_FAILED", () => {
  const wire = encryptOperatorCred("secret", KEY);
  const wrongKey = parseMasterKey(
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  );
  assert.throws(
    () => decryptOperatorCred(wire, wrongKey),
    (err: any) =>
      err instanceof OperatorCredsCryptoError && err.cause === "AUTH_FAILED",
  );
});

test("decrypt with tampered ciphertext throws AUTH_FAILED", () => {
  const wire = encryptOperatorCred("secret", KEY);
  // Flip a bit in the ciphertext.
  const parts = wire.split(":");
  const ctHex = parts[3]!;
  const flipped =
    ctHex.slice(0, 0) +
    (ctHex[0] === "f" ? "0" : "f") +
    ctHex.slice(1);
  const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${flipped}`;
  assert.throws(
    () => decryptOperatorCred(tampered, KEY),
    (err: any) => err instanceof OperatorCredsCryptoError,
  );
});

test("decrypt rejects bad format", () => {
  assert.throws(
    () => decryptOperatorCred("not-a-wire", KEY),
    (err: any) =>
      err instanceof OperatorCredsCryptoError && err.cause === "BAD_FORMAT",
  );
});

test("decrypt rejects unknown version", () => {
  assert.throws(
    () => decryptOperatorCred("v2:aa:bb:cc", KEY),
    (err: any) =>
      err instanceof OperatorCredsCryptoError && err.cause === "BAD_VERSION",
  );
});

test("parseMasterKey rejects wrong-length key", () => {
  assert.throws(
    () => parseMasterKey("0123456789abcdef"),
    (err: any) =>
      err instanceof OperatorCredsCryptoError && err.cause === "BAD_KEY",
  );
});

test("parseMasterKey rejects non-hex chars", () => {
  assert.throws(
    () => parseMasterKey("z".repeat(64)),
    (err: any) =>
      err instanceof OperatorCredsCryptoError && err.cause === "BAD_KEY",
  );
});

test("isEncryptedWire identifies our format vs legacy plaintext", () => {
  const wire = encryptOperatorCred("x", KEY);
  assert.equal(isEncryptedWire(wire), true);
  assert.equal(isEncryptedWire("plain-text-secret"), false);
  assert.equal(isEncryptedWire("https://lnbits/api|admin-key"), false);
  assert.equal(isEncryptedWire("v1:aa:bb"), false); // wrong shape
});

test("round-trip preserves unicode", () => {
  const plaintext = "café — résumé — 你好 — 🔥";
  const wire = encryptOperatorCred(plaintext, KEY);
  assert.equal(decryptOperatorCred(wire, KEY), plaintext);
});

test("round-trip preserves long values (10kB)", () => {
  const plaintext = "x".repeat(10_000);
  const wire = encryptOperatorCred(plaintext, KEY);
  assert.equal(decryptOperatorCred(wire, KEY), plaintext);
});
