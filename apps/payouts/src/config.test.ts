import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

// Spec-canonical NIP-19 example values — documentation test vectors, not
// keys anyone uses for real signing.
const SAMPLE_NPUB =
  "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg";
const SAMPLE_NPUB_HEX =
  "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e";

// NIP-19 spec example nsec — public documentation test vector, not a real key.
const SAMPLE_NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"; // gitleaks:allow
const SAMPLE_NSEC_HEX = "67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa"; // gitleaks:allow

function baseEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgres://x",
    BITCOIN_RPC_URL: "http://x",
    BITCOIN_RPC_USER: "u",
    BITCOIN_RPC_PASSWORD: "p",
  };
}

test("loads npub/nsec as bech32 → decodes to hex", () => {
  const cfg = loadConfig({
    ...baseEnv(),
    PROJECT_NPUB: SAMPLE_NPUB,
    PROJECT_NSEC: SAMPLE_NSEC,
  });
  assert.equal(cfg.projectNpubHex, SAMPLE_NPUB_HEX);
  assert.equal(cfg.projectNsecHex, SAMPLE_NSEC_HEX);
});

test("loads npub/nsec as hex (still works)", () => {
  const cfg = loadConfig({
    ...baseEnv(),
    PROJECT_NPUB: SAMPLE_NPUB_HEX,
    PROJECT_NSEC: SAMPLE_NSEC_HEX,
  });
  assert.equal(cfg.projectNpubHex, SAMPLE_NPUB_HEX);
  assert.equal(cfg.projectNsecHex, SAMPLE_NSEC_HEX);
});

test("legacy *_HEX env names still work", () => {
  const cfg = loadConfig({
    ...baseEnv(),
    PROJECT_NPUB_HEX: SAMPLE_NPUB_HEX,
    PROJECT_NSEC_HEX: SAMPLE_NSEC_HEX,
  });
  assert.equal(cfg.projectNpubHex, SAMPLE_NPUB_HEX);
  assert.equal(cfg.projectNsecHex, SAMPLE_NSEC_HEX);
});

test("new name beats legacy when both set", () => {
  const otherHex =
    "0000000000000000000000000000000000000000000000000000000000000001";
  const cfg = loadConfig({
    ...baseEnv(),
    PROJECT_NPUB: SAMPLE_NPUB, // bech32 → SAMPLE_NPUB_HEX
    PROJECT_NPUB_HEX: otherHex,
    PROJECT_NSEC: SAMPLE_NSEC,
    PROJECT_NSEC_HEX: otherHex,
  });
  assert.equal(cfg.projectNpubHex, SAMPLE_NPUB_HEX);
  assert.equal(cfg.projectNsecHex, SAMPLE_NSEC_HEX);
});

test("rejects npub value in PROJECT_NSEC slot (and vice versa)", () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv(),
        PROJECT_NPUB: SAMPLE_NPUB,
        PROJECT_NSEC: SAMPLE_NPUB, // wrong type
      }),
    /expected nsec, got npub/,
  );
});

test("rejects malformed bech32", () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv(),
        PROJECT_NPUB: "npub1notvalidbech32",
        PROJECT_NSEC: SAMPLE_NSEC,
      }),
    /invalid npub bech32/,
  );
});

test("rejects non-hex non-bech32 garbage", () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv(),
        PROJECT_NPUB: "not-a-key",
        PROJECT_NSEC: SAMPLE_NSEC,
      }),
    /must be npub1\.\.\. \(bech32\) or 64-char hex/,
  );
});

test("missing both new and legacy raises", () => {
  assert.throws(
    () => loadConfig({ ...baseEnv(), PROJECT_NSEC: SAMPLE_NSEC }),
    /required env var missing: one of PROJECT_NPUB, PROJECT_NPUB_HEX/,
  );
});
