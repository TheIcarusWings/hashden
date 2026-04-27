import { test } from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";
import {
  encodeOutput,
  encodeOutputs,
  findBelowProtocolDust,
  DUST_THRESHOLD_SATS,
} from "./script.js";
import type { CoinbaseOutput } from "@hashden/shared";

const VALID_PUBKEY =
  "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

// Well-known mainnet addresses for each type.
const ADDRS = {
  p2pkh: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  p2sh: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  p2wpkh: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  p2wsh: "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
  p2tr: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
};

function out(
  address: string,
  sats: bigint,
  kind: CoinbaseOutput["kind"] = "MEMBER",
  memberPubkey?: string,
): CoinbaseOutput {
  return {
    address,
    sats: sats.toString(),
    kind,
    ...(memberPubkey ? { memberPubkey } : {}),
  };
}

test("P2PKH address encodes to OP_DUP OP_HASH160 <20-byte> OP_EQUALVERIFY OP_CHECKSIG", () => {
  const r = encodeOutput(out(ADDRS.p2pkh, 100_000n));
  // P2PKH script: 76 a9 14 <hash160> 88 ac → 25 bytes total
  assert.equal(r.scriptPubKey.length, 25);
  assert.equal(r.scriptPubKey[0], 0x76); // OP_DUP
  assert.equal(r.scriptPubKey[1], 0xa9); // OP_HASH160
  assert.equal(r.scriptPubKey[2], 0x14); // push 20 bytes
  assert.equal(r.scriptPubKey[23], 0x88); // OP_EQUALVERIFY
  assert.equal(r.scriptPubKey[24], 0xac); // OP_CHECKSIG
});

test("P2SH address encodes to OP_HASH160 <20-byte> OP_EQUAL", () => {
  const r = encodeOutput(out(ADDRS.p2sh, 100_000n));
  assert.equal(r.scriptPubKey.length, 23);
  assert.equal(r.scriptPubKey[0], 0xa9); // OP_HASH160
  assert.equal(r.scriptPubKey[1], 0x14); // push 20 bytes
  assert.equal(r.scriptPubKey[22], 0x87); // OP_EQUAL
});

test("P2WPKH bech32 encodes to OP_0 <20-byte>", () => {
  const r = encodeOutput(out(ADDRS.p2wpkh, 100_000n));
  // 00 14 <20-byte hash> = 22 bytes
  assert.equal(r.scriptPubKey.length, 22);
  assert.equal(r.scriptPubKey[0], 0x00); // version 0
  assert.equal(r.scriptPubKey[1], 0x14); // push 20 bytes
});

test("P2WSH bech32 encodes to OP_0 <32-byte>", () => {
  const r = encodeOutput(out(ADDRS.p2wsh, 100_000n));
  assert.equal(r.scriptPubKey.length, 34);
  assert.equal(r.scriptPubKey[0], 0x00);
  assert.equal(r.scriptPubKey[1], 0x20); // push 32 bytes
});

test("P2TR bech32m encodes to OP_1 <32-byte>", () => {
  const r = encodeOutput(out(ADDRS.p2tr, 100_000n));
  assert.equal(r.scriptPubKey.length, 34);
  assert.equal(r.scriptPubKey[0], 0x51); // OP_1
  assert.equal(r.scriptPubKey[1], 0x20); // push 32 bytes
});

test("preserves kind and memberPubkey through encoding", () => {
  const r = encodeOutput(out(ADDRS.p2wpkh, 76_171_875n, "MEMBER", VALID_PUBKEY));
  assert.equal(r.kind, "MEMBER");
  assert.equal(r.memberPubkey, VALID_PUBKEY);
  assert.equal(r.valueSats, 76_171_875n);
});

test("OPERATOR_FEE / PLATFORM_FEE / DUST_BUCKET kinds round-trip", () => {
  for (const k of ["OPERATOR_FEE", "PLATFORM_FEE", "DUST_BUCKET"] as const) {
    const r = encodeOutput(out(ADDRS.p2tr, 1_000_000n, k));
    assert.equal(r.kind, k);
    assert.equal(r.memberPubkey, undefined);
  }
});

test("rejects garbage addresses with descriptive error", () => {
  assert.throws(
    () => encodeOutput(out("not-a-real-address", 100n)),
    /Failed to encode address not-a-real-address/,
  );
});

test("rejects empty address", () => {
  assert.throws(() => encodeOutput(out("", 100n)));
});

test("rejects negative sats", () => {
  assert.throws(
    () => encodeOutput(out(ADDRS.p2wpkh, -1n)),
    /Negative output value/,
  );
});

test("zero sats is allowed at the encoding layer (caller's responsibility to filter)", () => {
  // The PPLNS builder already drops zero-sat outputs before reaching here,
  // but the encoder itself doesn't enforce "must be > 0".
  const r = encodeOutput(out(ADDRS.p2wpkh, 0n));
  assert.equal(r.valueSats, 0n);
});

test("encodeOutputs preserves order", () => {
  const inputs: CoinbaseOutput[] = [
    out(ADDRS.p2wpkh, 1n, "MEMBER", VALID_PUBKEY),
    out(ADDRS.p2sh, 2n, "OPERATOR_FEE"),
    out(ADDRS.p2tr, 3n, "PLATFORM_FEE"),
  ];
  const outputs = encodeOutputs(inputs);
  assert.equal(outputs.length, 3);
  assert.equal(outputs[0]!.kind, "MEMBER");
  assert.equal(outputs[1]!.kind, "OPERATOR_FEE");
  assert.equal(outputs[2]!.kind, "PLATFORM_FEE");
  assert.equal(outputs[0]!.valueSats, 1n);
  assert.equal(outputs[1]!.valueSats, 2n);
  assert.equal(outputs[2]!.valueSats, 3n);
});

test("findBelowProtocolDust catches pre-protocol-dust outputs", () => {
  const encoded = encodeOutputs([
    out(ADDRS.p2wpkh, 100n), // below 546
    out(ADDRS.p2tr, 500n), // below 546
    out(ADDRS.p2wpkh, 1000n), // above 546
    out(ADDRS.p2sh, 0n), // zero — excluded from the "below dust" filter
  ]);
  const dusty = findBelowProtocolDust(encoded);
  assert.equal(dusty.length, 2);
  assert.equal(dusty[0]!.valueSats, 100n);
  assert.equal(dusty[1]!.valueSats, 500n);
});

test("DUST_THRESHOLD_SATS is the standard 546-sat boundary", () => {
  assert.equal(DUST_THRESHOLD_SATS, 546n);
});

test("network override: regtest address valid on regtest, invalid on mainnet", () => {
  // Generate a regtest P2WPKH address (we can't use mainnet ADDRS for this).
  // Use bitcoin.payments to get a known regtest address.
  const regtestAddr = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "hex",
    ),
    network: bitcoin.networks.regtest,
  }).address!;
  // Must succeed on regtest.
  assert.doesNotThrow(() =>
    encodeOutput(out(regtestAddr, 100n), { network: bitcoin.networks.regtest }),
  );
  // Should fail on mainnet (default).
  assert.throws(() => encodeOutput(out(regtestAddr, 100n)));
});
