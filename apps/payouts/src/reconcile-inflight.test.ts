import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileInFlight } from "./reconcile-inflight.js";

interface AttemptRow {
  id: string;
  blockId: string;
  memberPubkey: string;
  lnPaymentHash: string | null;
  status: string;
  block: { groupId: string };
}

function fakePrisma(initial: AttemptRow[]) {
  const rows = initial.map((r) => ({ ...r }));
  return {
    payoutAttempt: {
      findMany: async (args: any) => {
        // Filter for IN_FLIGHT + LN_DUST per the call site.
        return rows.filter(
          (r) =>
            r.status === args.where.status &&
            args.where.kind === "LN_DUST",
        );
      },
      update: async (args: any) => {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error(`row ${args.where.id} not found`);
        Object.assign(row, args.data);
        return row;
      },
    },
    _rows: rows,
  } as any;
}

function lnbitsClient(
  responses: Record<string, { paid: boolean; pending: boolean } | { error: string }>,
) {
  return {
    getPaymentStatus: async (hash: string) => {
      const r = responses[hash];
      if (!r) throw new Error(`unknown hash ${hash}`);
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  } as any;
}

test("paid IN_FLIGHT → PAID", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () =>
      lnbitsClient({ h1: { paid: true, pending: false } }),
  });
  assert.equal(r.scanned, 1);
  assert.equal(r.promotedPaid, 1);
  assert.equal(prisma._rows[0].status, "PAID");
});

test("pending → still IN_FLIGHT (no transition)", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () =>
      lnbitsClient({ h1: { paid: false, pending: true } }),
  });
  assert.equal(r.stillInFlight, 1);
  assert.equal(prisma._rows[0].status, "IN_FLIGHT");
});

test("not paid + not pending → FAILED", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () =>
      lnbitsClient({ h1: { paid: false, pending: false } }),
  });
  assert.equal(r.markedFailed, 1);
  assert.equal(prisma._rows[0].status, "FAILED");
});

test("missing lnPaymentHash → FAILED + unrecoverable", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: null,
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () => lnbitsClient({}),
  });
  assert.equal(r.markedFailed, 1);
  assert.equal(r.unrecoverable, 1);
  assert.equal(prisma._rows[0].status, "FAILED");
});

test("operator credentials missing → leave IN_FLIGHT", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () => null,
  });
  assert.equal(r.stillInFlight, 1);
  assert.equal(prisma._rows[0].status, "IN_FLIGHT");
});

test("getPaymentStatus errors → leave IN_FLIGHT (next pass retries)", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () =>
      lnbitsClient({ h1: { error: "lnbits down" } }),
  });
  assert.equal(r.stillInFlight, 1);
  assert.equal(prisma._rows[0].status, "IN_FLIGHT");
});

test("multiple attempts processed independently", async () => {
  const prisma = fakePrisma([
    {
      id: "a1",
      blockId: "b1",
      memberPubkey: "pk1",
      lnPaymentHash: "h1",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
    {
      id: "a2",
      blockId: "b1",
      memberPubkey: "pk2",
      lnPaymentHash: "h2",
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
    {
      id: "a3",
      blockId: "b1",
      memberPubkey: "pk3",
      lnPaymentHash: null,
      status: "IN_FLIGHT",
      block: { groupId: "g1" },
    },
  ]);
  const r = await reconcileInFlight({
    prisma,
    buildLnClient: async () =>
      lnbitsClient({
        h1: { paid: true, pending: false },
        h2: { paid: false, pending: false },
      }),
  });
  assert.equal(r.scanned, 3);
  assert.equal(r.promotedPaid, 1);
  assert.equal(r.markedFailed, 2);
  assert.equal(r.unrecoverable, 1);
});
