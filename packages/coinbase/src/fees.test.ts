import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFees, validateFees } from "./fees.js";

const ONE_BTC = 100_000_000n;
const HALVING_4 = 312_500_000n; // 3.125 BTC subsidy era

test("splitFees: 0% fees → all remaining", () => {
  const r = splitFees({
    blockRewardSats: HALVING_4,
    operatorFeeBps: 0,
    platformFeeBps: 0,
  });
  assert.equal(r.operatorFeeSats, 0n);
  assert.equal(r.platformFeeSats, 0n);
  assert.equal(r.remainingSats, HALVING_4);
});

test("splitFees: 2% operator + 0.5% platform", () => {
  const r = splitFees({
    blockRewardSats: HALVING_4,
    operatorFeeBps: 200,
    platformFeeBps: 50,
  });
  // 2% of 312500000 = 6250000
  // 0.5% of 312500000 = 1562500
  assert.equal(r.operatorFeeSats, 6_250_000n);
  assert.equal(r.platformFeeSats, 1_562_500n);
  assert.equal(r.remainingSats, HALVING_4 - 6_250_000n - 1_562_500n);
  assert.equal(
    r.operatorFeeSats + r.platformFeeSats + r.remainingSats,
    HALVING_4,
  );
});

test("splitFees: rounding leftover stays in remaining", () => {
  // 1 sat * 1bps = 0.0001 sats → floored to 0
  const r = splitFees({
    blockRewardSats: 1n,
    operatorFeeBps: 1,
    platformFeeBps: 1,
  });
  assert.equal(r.operatorFeeSats, 0n);
  assert.equal(r.platformFeeSats, 0n);
  assert.equal(r.remainingSats, 1n);
});

test("splitFees: 100% operator + 0% platform → no remaining", () => {
  const r = splitFees({
    blockRewardSats: ONE_BTC,
    operatorFeeBps: 10_000,
    platformFeeBps: 0,
  });
  assert.equal(r.operatorFeeSats, ONE_BTC);
  assert.equal(r.platformFeeSats, 0n);
  assert.equal(r.remainingSats, 0n);
});

test("validateFees: rejects negative reward", () => {
  assert.throws(() =>
    validateFees({ blockRewardSats: 0n, operatorFeeBps: 0, platformFeeBps: 0 }),
  );
  assert.throws(() =>
    validateFees({ blockRewardSats: -1n, operatorFeeBps: 0, platformFeeBps: 0 }),
  );
});

test("validateFees: rejects bps out of range", () => {
  assert.throws(() =>
    validateFees({ blockRewardSats: 1n, operatorFeeBps: -1, platformFeeBps: 0 }),
  );
  assert.throws(() =>
    validateFees({ blockRewardSats: 1n, operatorFeeBps: 10_001, platformFeeBps: 0 }),
  );
  assert.throws(() =>
    validateFees({ blockRewardSats: 1n, operatorFeeBps: 1.5, platformFeeBps: 0 }),
  );
});

test("validateFees: rejects fees summing > 100%", () => {
  assert.throws(() =>
    validateFees({
      blockRewardSats: 1n,
      operatorFeeBps: 6_000,
      platformFeeBps: 5_000,
    }),
  );
});
