import { test } from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";
import {
  reconstructCoinbaseHex,
  parseCoinbaseOutputs,
} from "./coinbase.js";

const NET = bitcoin.networks.bitcoin;

function p2wpkh(fill: number): { address: string; script: Buffer } {
  const pay = bitcoin.payments.p2wpkh({
    hash: Buffer.alloc(20, fill),
    network: NET,
  });
  return { address: pay.address!, script: pay.output! };
}

function buildCoinbase(
  inputScript: Buffer,
  outs: { script: Buffer; value: number }[],
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0), 0xffffffff, 0xffffffff, inputScript);
  for (const o of outs) tx.addOutput(o.script, o.value);
  return tx;
}

test("reconstructCoinbaseHex concatenates with zero-filled extranonce2", () => {
  assert.equal(
    reconstructCoinbaseHex("aabb", "cccc", 2, "ddee"),
    "aabbcccc0000ddee",
  );
});

test("parseCoinbaseOutputs reads every output's script + value", () => {
  const a = p2wpkh(0x11);
  const b = p2wpkh(0x22);
  const tx = buildCoinbase(Buffer.from("03010203706f6f6c", "hex"), [
    { script: a.script, value: 312_500_000 },
    { script: b.script, value: 6_250_000 },
  ]);
  const outs = parseCoinbaseOutputs(tx.toHex());
  assert.equal(outs.length, 2);
  assert.equal(outs[0].valueSats, 312_500_000n);
  assert.deepEqual(outs[0].scriptPubKey, new Uint8Array(a.script));
  assert.equal(outs[1].valueSats, 6_250_000n);
  assert.deepEqual(outs[1].scriptPubKey, new Uint8Array(b.script));
});

test("reconstruct-with-zeros recovers the same OUTPUTS as the real coinbase (extranonce2 only touches the input)", () => {
  // 12-byte extranonce region (4 = extranonce1, 8 = extranonce2), distinct bytes
  // so we can locate it unambiguously in the serialized tx.
  const region = Buffer.from("e0e1e2e3e4e5e6e7e8e9eaeb", "hex");
  const inputScript = Buffer.concat([
    Buffer.from("03010203", "hex"), // height push
    Buffer.from("706f6f6c", "hex"), // "pool"
    region,
  ]);
  const a = p2wpkh(0x33);
  const b = p2wpkh(0x44);
  const tx = buildCoinbase(inputScript, [
    { script: a.script, value: 300_000_000 },
    { script: b.script, value: 12_500_000 },
  ]);
  const hex = tx.toHex();

  // Split the way apps/stratum does: coinbase1 ends just before the extranonce
  // region, coinbase2 begins just after it.
  const regionHex = region.toString("hex");
  const idx = hex.indexOf(regionHex);
  assert.ok(idx > 0, "extranonce region found in serialized tx");
  const coinbase1 = hex.slice(0, idx);
  const coinbase2 = hex.slice(idx + regionHex.length);
  const extranonce1 = "e0e1e2e3"; // first 4 bytes of the region

  // The miner/verifier reconstructs with a DIFFERENT extranonce2 (zeros) — the
  // outputs must still come out identical.
  const rebuilt = reconstructCoinbaseHex(coinbase1, extranonce1, 8, coinbase2);
  assert.notEqual(rebuilt, hex, "input bytes differ (extranonce2 = zeros)");

  const outs = parseCoinbaseOutputs(rebuilt);
  assert.equal(outs.length, 2);
  assert.deepEqual(outs[0].scriptPubKey, new Uint8Array(a.script));
  assert.equal(outs[0].valueSats, 300_000_000n);
  assert.deepEqual(outs[1].scriptPubKey, new Uint8Array(b.script));
  assert.equal(outs[1].valueSats, 12_500_000n);
});
