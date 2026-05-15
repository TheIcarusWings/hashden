import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoloShowcaseCoinbase } from "./solo-showcase.js";
import type { CoinbaseOutput } from "@hashden/shared";

const HALVING_4 = 312_500_000n;
const VALID_PUBKEY =
  "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

const ADDRS = {
  miner: "bc1q_miner_winner",
  operator: "bc1q_operator",
  platform: "bc1q_platform_cold",
};

function sumSats(outs: CoinbaseOutput[]): bigint {
  return outs.reduce((acc, o) => acc + BigInt(o.sats), 0n);
}

test("standard 2% + 0.5% fees", () => {
  const outs = buildSoloShowcaseCoinbase({
    blockRewardSats: HALVING_4,
    minerBtcAddress: ADDRS.miner,
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    minerPubkey: VALID_PUBKEY,
    operatorFeeBps: 200,
    platformFeeBps: 50,
  });
  assert.equal(outs.length, 3);
  // Sum equals reward exactly — no coin creation, no destruction.
  assert.equal(sumSats(outs), HALVING_4);
  // Output 0 is the winner.
  assert.equal(outs[0]!.kind, "MEMBER");
  assert.equal(outs[0]!.memberPubkey, VALID_PUBKEY);
  assert.equal(outs[0]!.address, ADDRS.miner);
  // Output 1 is operator fee, output 2 is platform fee.
  assert.equal(outs[1]!.kind, "OPERATOR_FEE");
  assert.equal(outs[1]!.sats, "6250000");
  assert.equal(outs[2]!.kind, "PLATFORM_FEE");
  assert.equal(outs[2]!.sats, "1562500");
});

test("zero fees → single output to winner", () => {
  const outs = buildSoloShowcaseCoinbase({
    blockRewardSats: HALVING_4,
    minerBtcAddress: ADDRS.miner,
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    minerPubkey: VALID_PUBKEY,
    operatorFeeBps: 0,
    platformFeeBps: 0,
  });
  assert.equal(outs.length, 1);
  assert.equal(outs[0]!.sats, HALVING_4.toString());
});

test("zero operator fee, nonzero platform fee → 2 outputs", () => {
  const outs = buildSoloShowcaseCoinbase({
    blockRewardSats: HALVING_4,
    minerBtcAddress: ADDRS.miner,
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    minerPubkey: VALID_PUBKEY,
    operatorFeeBps: 0,
    platformFeeBps: 50,
  });
  assert.equal(outs.length, 2);
  assert.equal(outs[0]!.kind, "MEMBER");
  assert.equal(outs[1]!.kind, "PLATFORM_FEE");
  assert.equal(sumSats(outs), HALVING_4);
});

test("rejects missing addresses", () => {
  assert.throws(() =>
    buildSoloShowcaseCoinbase({
      blockRewardSats: HALVING_4,
      minerBtcAddress: "",
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      minerPubkey: VALID_PUBKEY,
      operatorFeeBps: 0,
      platformFeeBps: 0,
    }),
  );
});

test("rejects negative reward", () => {
  assert.throws(() =>
    buildSoloShowcaseCoinbase({
      blockRewardSats: 0n,
      minerBtcAddress: ADDRS.miner,
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      minerPubkey: VALID_PUBKEY,
      operatorFeeBps: 0,
      platformFeeBps: 0,
    }),
  );
});
