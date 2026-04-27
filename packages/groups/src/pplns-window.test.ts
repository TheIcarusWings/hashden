import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePplnsWindow,
  type PplnsPrismaLike,
} from "./pplns-window.js";

const PK = (i: number) => i.toString(16).padStart(64, "0");

interface Stub {
  shares: Array<{ memberPubkey: string; difficulty: number }>;
  members: Array<{ memberPubkey: string; btcAddress: string }>;
  callsShare: Array<{ groupId: string; take: number }>;
  callsMember: Array<{ groupId: string; pubkeys: string[] }>;
}

function fakePrisma(stub: Stub): PplnsPrismaLike {
  return {
    group: {
      findUnique: async () => null,
    },
    member: {
      findUnique: async () => null,
      findMany: async (args) => {
        stub.callsMember.push({
          groupId: args.where.groupId,
          pubkeys: args.where.memberPubkey.in,
        });
        const set = new Set(args.where.memberPubkey.in);
        return stub.members.filter((m) => set.has(m.memberPubkey));
      },
    },
    share: {
      findMany: async (args) => {
        stub.callsShare.push({
          groupId: args.where.groupId,
          take: args.take,
        });
        return stub.shares.slice(0, args.take);
      },
    },
  };
}

test("empty share table → empty window", async () => {
  const stub: Stub = { shares: [], members: [], callsShare: [], callsMember: [] };
  const out = await computePplnsWindow(fakePrisma(stub), {
    groupId: "g_1",
    windowSize: 100,
  });
  assert.deepEqual(out, []);
  // No member.findMany call when there are no shares.
  assert.equal(stub.callsMember.length, 0);
});

test("3 members with varying share counts → sums correct weights, sorted ascending", async () => {
  const stub: Stub = {
    shares: [
      // Most recent first (ordered desc by ts)
      { memberPubkey: PK(3), difficulty: 1.5 },
      { memberPubkey: PK(1), difficulty: 1.0 },
      { memberPubkey: PK(2), difficulty: 2.0 },
      { memberPubkey: PK(1), difficulty: 1.0 },
      { memberPubkey: PK(3), difficulty: 1.5 },
      { memberPubkey: PK(1), difficulty: 1.0 },
    ],
    members: [
      { memberPubkey: PK(1), btcAddress: "addr1" },
      { memberPubkey: PK(2), btcAddress: "addr2" },
      { memberPubkey: PK(3), btcAddress: "addr3" },
    ],
    callsShare: [],
    callsMember: [],
  };
  const out = await computePplnsWindow(fakePrisma(stub), {
    groupId: "g_1",
    windowSize: 100,
  });
  // Sorted ascending by memberPubkey.
  assert.equal(out[0]!.memberPubkey, PK(1));
  assert.equal(out[1]!.memberPubkey, PK(2));
  assert.equal(out[2]!.memberPubkey, PK(3));
  // Weights = sum of difficulties × 1e6 scale.
  assert.equal(out[0]!.shareWeight, 3_000_000n); // 3 × 1.0
  assert.equal(out[1]!.shareWeight, 2_000_000n); // 1 × 2.0
  assert.equal(out[2]!.shareWeight, 3_000_000n); // 2 × 1.5
});

test("respects windowSize — only takes last N shares", async () => {
  // 100 shares; only window of 5 should include the most recent 5.
  const shares = Array.from({ length: 100 }, (_, i) => ({
    memberPubkey: PK((i % 3) + 1),
    difficulty: 1.0,
  }));
  const stub: Stub = {
    shares,
    members: [
      { memberPubkey: PK(1), btcAddress: "addr1" },
      { memberPubkey: PK(2), btcAddress: "addr2" },
      { memberPubkey: PK(3), btcAddress: "addr3" },
    ],
    callsShare: [],
    callsMember: [],
  };
  await computePplnsWindow(fakePrisma(stub), { groupId: "g_1", windowSize: 5 });
  assert.equal(stub.callsShare[0]!.take, 5);
});

test("member deleted mid-window → silently dropped from result", async () => {
  const stub: Stub = {
    shares: [
      { memberPubkey: PK(1), difficulty: 1.0 },
      { memberPubkey: PK(2), difficulty: 1.0 }, // member 2 was deleted
    ],
    members: [{ memberPubkey: PK(1), btcAddress: "addr1" }], // only 1 returned
    callsShare: [],
    callsMember: [],
  };
  const out = await computePplnsWindow(fakePrisma(stub), {
    groupId: "g_1",
    windowSize: 100,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.memberPubkey, PK(1));
});

test("rejects invalid windowSize", async () => {
  const stub: Stub = { shares: [], members: [], callsShare: [], callsMember: [] };
  await assert.rejects(
    computePplnsWindow(fakePrisma(stub), { groupId: "g", windowSize: 0 }),
  );
  await assert.rejects(
    computePplnsWindow(fakePrisma(stub), { groupId: "g", windowSize: -1 }),
  );
  await assert.rejects(
    computePplnsWindow(fakePrisma(stub), { groupId: "g", windowSize: 1.5 }),
  );
});

test("rejects empty groupId", async () => {
  const stub: Stub = { shares: [], members: [], callsShare: [], callsMember: [] };
  await assert.rejects(
    computePplnsWindow(fakePrisma(stub), { groupId: "", windowSize: 10 }),
  );
});

test("output is structurally compatible with @hashden/coinbase PplnsMember", async () => {
  // Compile-time check: the result of computePplnsWindow can be passed
  // straight into buildPplnsCoinbase. Run it as a runtime smoke too.
  const stub: Stub = {
    shares: [{ memberPubkey: PK(1), difficulty: 1.5 }],
    members: [{ memberPubkey: PK(1), btcAddress: "addr1" }],
    callsShare: [],
    callsMember: [],
  };
  const out = await computePplnsWindow(fakePrisma(stub), {
    groupId: "g",
    windowSize: 1,
  });
  assert.equal(out.length, 1);
  // Shape: { memberPubkey: string, btcAddress: string, shareWeight: bigint }
  assert.equal(typeof out[0]!.memberPubkey, "string");
  assert.equal(typeof out[0]!.btcAddress, "string");
  assert.equal(typeof out[0]!.shareWeight, "bigint");
});
