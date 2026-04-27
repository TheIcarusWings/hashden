import { test } from "node:test";
import assert from "node:assert/strict";
import { fanoutDust, recordOnChainPayouts } from "./dust-fanout.js";
import type { LnbitsClient } from "./lnbits-client.js";

const PK = (n: number) => n.toString(16).padStart(64, "0");
const HASH = "01".repeat(32);

interface PayoutAttemptRow {
  id: string;
  blockId: string;
  memberPubkey: string;
  kind: "ON_CHAIN_COINBASE" | "LN_DUST";
  status: "PENDING" | "IN_FLIGHT" | "PAID" | "FAILED";
  amountSats: bigint;
  lnPaymentHash?: string;
}

interface BlockRow {
  id: string;
  groupId: string;
  hash: string;
  status: "FOUND" | "MATURED" | "ORPHANED" | "DUST_FANNED_OUT";
  coinbaseOutputs: unknown;
}

interface MemberRow {
  groupId: string;
  memberPubkey: string;
  lightningAddress: string;
}

function fakePrisma(opts: {
  blocks: BlockRow[];
  members: MemberRow[];
  attempts?: PayoutAttemptRow[];
}) {
  const blocks = [...opts.blocks];
  const members = [...opts.members];
  const attempts: PayoutAttemptRow[] = [...(opts.attempts ?? [])];
  let nextId = 1;

  return {
    block: {
      findUnique: async (a: any) => blocks.find((b) => b.id === a.where.id) ?? null,
      update: async (a: any) => {
        const b = blocks.find((x) => x.id === a.where.id);
        if (b) Object.assign(b, a.data);
        return b;
      },
    },
    member: {
      findUnique: async (a: any) => {
        const k = a.where.groupId_memberPubkey;
        return (
          members.find(
            (m) => m.groupId === k.groupId && m.memberPubkey === k.memberPubkey,
          ) ?? null
        );
      },
    },
    payoutAttempt: {
      upsert: async (a: any) => {
        const k = a.where.blockId_memberPubkey_kind;
        const existing = attempts.find(
          (x) =>
            x.blockId === k.blockId &&
            x.memberPubkey === k.memberPubkey &&
            x.kind === k.kind,
        );
        if (existing) {
          Object.assign(existing, a.update);
          return { id: existing.id };
        }
        const row: PayoutAttemptRow = {
          id: `pa_${nextId++}`,
          ...a.create,
        };
        attempts.push(row);
        return { id: row.id };
      },
      findMany: async (a: any) => {
        return attempts.filter(
          (x) =>
            x.blockId === a.where.blockId &&
            x.kind === a.where.kind &&
            x.status === a.where.status,
        );
      },
      updateMany: async (a: any) => {
        let count = 0;
        for (const x of attempts) {
          if (
            x.id === a.where.id &&
            (a.where.status ? x.status === a.where.status : true)
          ) {
            Object.assign(x, a.data);
            count++;
          }
          if (
            !a.where.id &&
            x.blockId === a.where.blockId &&
            x.kind === a.where.kind &&
            x.status === a.where.status
          ) {
            Object.assign(x, a.data);
            count++;
          }
        }
        return { count };
      },
      update: async (a: any) => {
        const x = attempts.find((y) => y.id === a.where.id);
        if (x) Object.assign(x, a.data);
        return x;
      },
    },
    _attempts: attempts,
    _blocks: blocks,
  } as any;
}

function fakeLnbits(
  fn: (address: string, sats: bigint) => Promise<{ paymentHash: string }>,
): LnbitsClient {
  return {
    payLightningAddress: fn,
  } as unknown as LnbitsClient;
}

test("recordOnChainPayouts: writes PAID rows for MEMBER outputs", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [
          {
            address: "bc1qa",
            sats: "76171875",
            kind: "MEMBER",
            memberPubkey: PK(1),
          },
          {
            address: "bc1qb",
            sats: "84309883",
            kind: "MEMBER",
            memberPubkey: PK(2),
          },
          {
            address: "bc1qop",
            sats: "6260552",
            kind: "OPERATOR_FEE",
          },
          {
            address: "bc1qpl",
            sats: "1565137",
            kind: "PLATFORM_FEE",
          },
        ],
      },
    ],
    members: [],
  });
  const r = await recordOnChainPayouts(prisma, "b1");
  assert.equal(r.recorded, 2);
  const paidRows = prisma._attempts.filter(
    (a: PayoutAttemptRow) => a.kind === "ON_CHAIN_COINBASE" && a.status === "PAID",
  );
  assert.equal(paidRows.length, 2);
});

test("recordOnChainPayouts: idempotent on second call", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [
          { address: "bc1qa", sats: "100", kind: "MEMBER", memberPubkey: PK(1) },
        ],
      },
    ],
    members: [],
  });
  await recordOnChainPayouts(prisma, "b1");
  await recordOnChainPayouts(prisma, "b1");
  const paidRows = prisma._attempts.filter(
    (a: PayoutAttemptRow) => a.kind === "ON_CHAIN_COINBASE",
  );
  assert.equal(paidRows.length, 1); // upsert prevents duplicate
});

test("fanoutDust: pays each PENDING dust attempt and marks PAID", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [],
      },
    ],
    members: [
      { groupId: "g1", memberPubkey: PK(1), lightningAddress: "alice@w.example" },
      { groupId: "g1", memberPubkey: PK(2), lightningAddress: "bob@w.example" },
    ],
    attempts: [
      {
        id: "pa1",
        blockId: "b1",
        memberPubkey: PK(1),
        kind: "LN_DUST",
        status: "PENDING",
        amountSats: 5000n,
      },
      {
        id: "pa2",
        blockId: "b1",
        memberPubkey: PK(2),
        kind: "LN_DUST",
        status: "PENDING",
        amountSats: 3000n,
      },
    ],
  });
  let payCount = 0;
  const lnbits = fakeLnbits(async (_address, _sats) => {
    payCount++;
    return { paymentHash: `phash_${payCount}` };
  });
  const r = await fanoutDust("b1", {
    prisma,
    buildLnbitsClient: async () => lnbits,
  });
  assert.equal(r.paid, 2);
  assert.equal(r.failed, 0);
  const paidAttempts = prisma._attempts.filter(
    (a: PayoutAttemptRow) => a.status === "PAID",
  );
  assert.equal(paidAttempts.length, 2);
  assert.equal(paidAttempts[0]!.lnPaymentHash, "phash_1");
  // Block status promoted on full success.
  assert.equal(prisma._blocks[0].status, "DUST_FANNED_OUT");
});

test("fanoutDust: ln payment failure → attempt FAILED, block stays MATURED", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [],
      },
    ],
    members: [
      { groupId: "g1", memberPubkey: PK(1), lightningAddress: "alice@w.example" },
    ],
    attempts: [
      {
        id: "pa1",
        blockId: "b1",
        memberPubkey: PK(1),
        kind: "LN_DUST",
        status: "PENDING",
        amountSats: 5000n,
      },
    ],
  });
  const lnbits = fakeLnbits(async () => {
    throw new Error("operator wallet has insufficient balance");
  });
  const r = await fanoutDust("b1", {
    prisma,
    buildLnbitsClient: async () => lnbits,
  });
  assert.equal(r.paid, 0);
  assert.equal(r.failed, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(prisma._attempts[0].status, "FAILED");
  // Block stays MATURED since failures remain — re-attempts welcome.
  assert.equal(prisma._blocks[0].status, "MATURED");
});

test("fanoutDust: no LN credentials → all attempts FAILED, block stays MATURED", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [],
      },
    ],
    members: [],
    attempts: [
      {
        id: "pa1",
        blockId: "b1",
        memberPubkey: PK(1),
        kind: "LN_DUST",
        status: "PENDING",
        amountSats: 5000n,
      },
    ],
  });
  const r = await fanoutDust("b1", {
    prisma,
    buildLnbitsClient: async () => null,
  });
  assert.equal(r.paid, 0);
  assert.equal(r.failed, 1);
  assert.equal(r.errors[0]!.reason, "operator has no LN credentials configured");
});

test("fanoutDust: rejects non-MATURED block", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "FOUND",
        coinbaseOutputs: [],
      },
    ],
    members: [],
  });
  await assert.rejects(
    fanoutDust("b1", {
      prisma,
      buildLnbitsClient: async () => null,
    }),
    /expected MATURED/,
  );
});

test("fanoutDust: deleted member → attempt FAILED with clear reason", async () => {
  const prisma = fakePrisma({
    blocks: [
      {
        id: "b1",
        groupId: "g1",
        hash: HASH,
        status: "MATURED",
        coinbaseOutputs: [],
      },
    ],
    members: [], // member was deleted
    attempts: [
      {
        id: "pa1",
        blockId: "b1",
        memberPubkey: PK(1),
        kind: "LN_DUST",
        status: "PENDING",
        amountSats: 5000n,
      },
    ],
  });
  const lnbits = fakeLnbits(async () => ({ paymentHash: "wontget" }));
  const r = await fanoutDust("b1", {
    prisma,
    buildLnbitsClient: async () => lnbits,
  });
  assert.equal(r.failed, 1);
  assert.match(r.errors[0]!.reason, /no longer registered/);
});
