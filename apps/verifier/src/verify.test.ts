import { test } from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";
import { verifyOutputs, type VerifyConfig } from "./verify.js";
import type { CoinbaseOutputParsed } from "./coinbase.js";

const NET = bitcoin.networks.bitcoin;

function addr(fill: number): { address: string; out: (sats: bigint) => CoinbaseOutputParsed } {
  const pay = bitcoin.payments.p2wpkh({
    hash: Buffer.alloc(20, fill),
    network: NET,
  });
  return {
    address: pay.address!,
    out: (sats) => ({ scriptPubKey: new Uint8Array(pay.output!), valueSats: sats }),
  };
}

const me = addr(0xaa);
const operator = addr(0xbb);
const platform = addr(0xcc);
const other = addr(0xdd);

function cfg(over: Partial<VerifyConfig>): VerifyConfig {
  return {
    myAddress: me.address,
    payoutRule: "SOLO_SHOWCASE",
    minRewardShare: 0.9,
    network: "mainnet",
    ...over,
  };
}

test("SOLO: pass when my address gets ≥ the reward floor", () => {
  const outs = [me.out(950n), operator.out(30n), platform.out(20n)];
  const r = verifyOutputs(outs, cfg({ payoutRule: "SOLO_SHOWCASE", minRewardShare: 0.9 }));
  assert.equal(r.ok, true);
  assert.equal(r.mySats, 950n);
  assert.equal(r.totalSats, 1000n);
  assert.ok(Math.abs(r.sharePct - 0.95) < 1e-9);
});

test("SOLO: fail when my share is below the floor (skim)", () => {
  const outs = [me.out(500n), other.out(500n)];
  const r = verifyOutputs(outs, cfg({ payoutRule: "SOLO_SHOWCASE", minRewardShare: 0.9 }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /only 50.00%/);
});

test("SOLO: fail when my address is absent (reward redirected)", () => {
  const outs = [operator.out(990n), platform.out(10n)];
  const r = verifyOutputs(outs, cfg({ payoutRule: "SOLO_SHOWCASE" }));
  assert.equal(r.ok, false);
  assert.equal(r.mySats, 0n);
  assert.match(r.reason, /NOT among/);
});

test("PPLNS: pass when my address is present (> 0)", () => {
  const outs = [other.out(700n), me.out(100n), operator.out(200n)];
  const r = verifyOutputs(outs, cfg({ payoutRule: "PPLNS", minRewardShare: 0 }));
  assert.equal(r.ok, true);
  assert.equal(r.mySats, 100n);
});

test("PPLNS: fail when my address is absent", () => {
  const outs = [other.out(800n), operator.out(200n)];
  const r = verifyOutputs(outs, cfg({ payoutRule: "PPLNS", minRewardShare: 0 }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /NOT among/);
});

test("PPLNS: fail when below the configured sats floor", () => {
  const outs = [other.out(900n), me.out(50n), operator.out(50n)];
  const r = verifyOutputs(
    outs,
    cfg({ payoutRule: "PPLNS", minRewardShare: 0, minSats: 100n }),
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /only 50 sats/);
});

test("invalid address is rejected up front", () => {
  assert.throws(
    () => verifyOutputs([me.out(1n)], cfg({ myAddress: "not-an-address" })),
    /Invalid mainnet address/,
  );
});
