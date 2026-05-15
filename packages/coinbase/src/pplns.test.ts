import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPplnsCoinbase, type PplnsMember } from "./pplns.js";
import type { CoinbaseOutput } from "@hashden/shared";

const HALVING_4 = 312_500_000n;
const ADDRS = {
  operator: "bc1q_operator",
  platform: "bc1q_platform_cold",
};

function sumSats(outs: CoinbaseOutput[]): bigint {
  return outs.reduce((acc, o) => acc + BigInt(o.sats), 0n);
}

function pubkey(n: number): string {
  // Deterministic, ascending pubkeys: pad index into 64-hex-char shape.
  const hex = n.toString(16).padStart(64, "0");
  return hex;
}

function addr(n: number): string {
  return `bc1q_member_${n}`;
}

function members(weights: bigint[]): PplnsMember[] {
  return weights.map((w, i) => ({
    memberPubkey: pubkey(i + 1),
    btcAddress: addr(i + 1),
    shareWeight: w,
  }));
}

test("equal weights, all above dust, 2% + 0.5% fees → conservation", () => {
  const r = buildPplnsCoinbase({
    blockRewardSats: HALVING_4,
    members: members([1n, 1n, 1n, 1n]),
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    operatorFeeBps: 200,
    platformFeeBps: 50,
    dustThresholdSats: 10_000n,
  });
  assert.equal(sumSats(r.outputs), HALVING_4);
  // 4 members + operator fee + platform fee = 6
  assert.equal(r.outputs.length, 6);
  // No dust members (each member's share is way above 10k sats threshold).
  assert.equal(r.dustBreakdown.length, 0);
  // Each member output should be approximately equal.
  const memberOuts = r.outputs.filter((o) => o.kind === "MEMBER");
  assert.equal(memberOuts.length, 4);
  const amounts = memberOuts.map((o) => BigInt(o.sats));
  for (const a of amounts) {
    // 312_500_000 * (1 - 0.025) = 304_687_500; / 4 = 76_171_875.
    assert.equal(a, 76_171_875n);
  }
});

test("very uneven weights — small members go to dust bucket", () => {
  // 1 whale (1000 weight), 5 plankton (1 weight each).
  const r = buildPplnsCoinbase({
    blockRewardSats: HALVING_4,
    members: members([1000n, 1n, 1n, 1n, 1n, 1n]),
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    operatorFeeBps: 0,
    platformFeeBps: 0,
    dustThresholdSats: 1_000_000n, // 0.01 BTC threshold
  });
  // Conservation
  assert.equal(sumSats(r.outputs), HALVING_4);
  // Total weight = 1005. Plankton = 312_500_000 / 1005 ≈ 310_945 each
  // → below 1_000_000 dust threshold → all 5 go to dust bucket.
  // Whale = 1000/1005 ≈ 310_945_273 → above dust → its own output.
  assert.equal(r.dustBreakdown.length, 5);
  const memberOuts = r.outputs.filter((o) => o.kind === "MEMBER");
  assert.equal(memberOuts.length, 1);
  const dustOuts = r.outputs.filter((o) => o.kind === "DUST_BUCKET");
  assert.equal(dustOuts.length, 1);
  // Dust bucket should equal the sum of dust members + any rounding remainder.
  const dustSatsFromBreakdown = r.dustBreakdown.reduce(
    (acc, e) => acc + BigInt(e.owedSats),
    0n,
  );
  // The dust bucket on-chain sats >= sum of breakdown (remainder may add to it).
  assert.ok(BigInt(dustOuts[0]!.sats) >= dustSatsFromBreakdown);
});

test("all members below dust threshold → entire reward to dust bucket", () => {
  const r = buildPplnsCoinbase({
    blockRewardSats: 1_000_000n, // 0.01 BTC
    members: members([1n, 1n, 1n, 1n, 1n]), // 5 members, 200_000 each
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    operatorFeeBps: 0,
    platformFeeBps: 0,
    dustThresholdSats: 500_000n, // each member's 200k is below 500k
  });
  assert.equal(sumSats(r.outputs), 1_000_000n);
  assert.equal(r.dustBreakdown.length, 5);
  const memberOuts = r.outputs.filter((o) => o.kind === "MEMBER");
  assert.equal(memberOuts.length, 0);
});

test("zero shares in window → all remaining sats to dust bucket", () => {
  const r = buildPplnsCoinbase({
    blockRewardSats: HALVING_4,
    members: members([0n, 0n]),
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    operatorFeeBps: 200,
    platformFeeBps: 50,
    dustThresholdSats: 10_000n,
  });
  // No share weight → no member outputs. Remaining goes to dust bucket
  // (operator owns it; can refund via Lightning or hold for next window).
  assert.equal(sumSats(r.outputs), HALVING_4);
  const memberOuts = r.outputs.filter((o) => o.kind === "MEMBER");
  assert.equal(memberOuts.length, 0);
  assert.equal(r.dustBreakdown.length, 0);
  // Dust bucket should contain (1 - 0.025) * 312_500_000 = 304_687_500
  const dust = r.outputs.find((o) => o.kind === "DUST_BUCKET");
  assert.equal(dust!.sats, "304687500");
});

test("rejects unsorted members", () => {
  assert.throws(() =>
    buildPplnsCoinbase({
      blockRewardSats: HALVING_4,
      members: [
        { memberPubkey: pubkey(2), btcAddress: addr(2), shareWeight: 1n },
        { memberPubkey: pubkey(1), btcAddress: addr(1), shareWeight: 1n },
      ],
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      operatorFeeBps: 0,
      platformFeeBps: 0,
      dustThresholdSats: 0n,
    }),
  );
});

test("rejects duplicate member pubkeys", () => {
  assert.throws(() =>
    buildPplnsCoinbase({
      blockRewardSats: HALVING_4,
      members: [
        { memberPubkey: pubkey(1), btcAddress: addr(1), shareWeight: 1n },
        { memberPubkey: pubkey(1), btcAddress: addr(2), shareWeight: 1n },
      ],
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      operatorFeeBps: 0,
      platformFeeBps: 0,
      dustThresholdSats: 0n,
    }),
  );
});

test("rejects missing btcAddress", () => {
  assert.throws(() =>
    buildPplnsCoinbase({
      blockRewardSats: HALVING_4,
      members: [
        { memberPubkey: pubkey(1), btcAddress: "", shareWeight: 1n },
      ],
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      operatorFeeBps: 0,
      platformFeeBps: 0,
      dustThresholdSats: 0n,
    }),
  );
});

test("determinism: same input → same output bytewise", () => {
  const input = {
    blockRewardSats: HALVING_4,
    members: members([7n, 13n, 23n, 29n, 31n]),
    operatorBtcAddress: ADDRS.operator,
    platformBtcAddress: ADDRS.platform,
    operatorFeeBps: 175,
    platformFeeBps: 25,
    dustThresholdSats: 100_000n,
  };
  const r1 = buildPplnsCoinbase(input);
  const r2 = buildPplnsCoinbase(input);
  assert.deepEqual(r1.outputs, r2.outputs);
  assert.deepEqual(r1.dustBreakdown, r2.dustBreakdown);
});

test("property: conservation across many random splits", () => {
  // Pseudo-random but deterministic — fuzz a wide variety of input shapes.
  const rng = mulberry32(0xC0FFEE);
  for (let trial = 0; trial < 200; trial++) {
    const memberCount = 1 + Math.floor(rng() * 20);
    const weights: bigint[] = [];
    for (let i = 0; i < memberCount; i++) {
      weights.push(BigInt(Math.floor(rng() * 1000) + 1));
    }
    const blockReward = BigInt(50_000_000 + Math.floor(rng() * 1_000_000_000));
    const opFeeBps = Math.floor(rng() * 500); // 0-5%
    const platFeeBps = Math.floor(rng() * 100); // 0-1%
    const dust = BigInt(Math.floor(rng() * 5_000_000)); // 0-0.05 BTC

    const r = buildPplnsCoinbase({
      blockRewardSats: blockReward,
      members: members(weights),
      operatorBtcAddress: ADDRS.operator,
      platformBtcAddress: ADDRS.platform,
      operatorFeeBps: opFeeBps,
      platformFeeBps: platFeeBps,
      dustThresholdSats: dust,
    });

    assert.equal(
      sumSats(r.outputs),
      blockReward,
      `trial ${trial}: sum mismatch with reward=${blockReward}, ` +
        `weights=${weights}, opBps=${opFeeBps}, platBps=${platFeeBps}, dust=${dust}`,
    );
    // Platform fee always exactly the configured percentage (no remainder leakage).
    const platOut = r.outputs.find((o) => o.kind === "PLATFORM_FEE");
    const expectedPlat = (blockReward * BigInt(platFeeBps)) / 10_000n;
    if (expectedPlat > 0n) {
      assert.equal(BigInt(platOut!.sats), expectedPlat);
    }
  }
});

// Minimal seeded PRNG for deterministic property tests.
function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
