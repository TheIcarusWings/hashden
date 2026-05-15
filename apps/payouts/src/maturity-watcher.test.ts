import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMaturity } from "./maturity-watcher.js";

interface BlockRow {
  id: string;
  hash: string;
  status?: string;
  maturedAt?: Date | null;
}

function fakePrisma(initial: BlockRow[]) {
  const rows = initial.map((r) => ({ ...r, status: r.status ?? "FOUND" }));
  return {
    block: {
      findMany: async (_args: any) => {
        return rows.filter((r) => r.status === "FOUND").map((r) => ({
          id: r.id,
          hash: r.hash,
        }));
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

function fakeRpc(
  responses: Map<string, { confirmations: number } | { error: string }>,
) {
  return {
    call: async (method: string, params: any[]) => {
      assert.equal(method, "getblock");
      const hash = params[0];
      const r = responses.get(hash);
      if (!r) throw new Error(`Block not found`);
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  } as any;
}

test("≥100 confirmations → MATURED", async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(new Map([["h1", { confirmations: 100 }]]));
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.deepEqual(r.matured, ["b1"]);
  assert.equal(r.orphaned.length, 0);
  assert.equal(prisma._rows[0].status, "MATURED");
  assert.ok(prisma._rows[0].maturedAt instanceof Date);
});

test("<100 confirmations → unchanged", async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(new Map([["h1", { confirmations: 99 }]]));
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.equal(r.matured.length, 0);
  assert.equal(prisma._rows[0].status, "FOUND");
});

test("negative confirmations → ORPHANED", async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(new Map([["h1", { confirmations: -1 }]]));
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.deepEqual(r.orphaned, ["b1"]);
  assert.equal(prisma._rows[0].status, "ORPHANED");
});

test('"Block not found" error → ORPHANED (deep reorg defensive)', async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(new Map([["h1", { error: "Block not found" }]]));
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.deepEqual(r.orphaned, ["b1"]);
});

test("other RPC error → captured in errored, status unchanged", async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(
    new Map([["h1", { error: "RPC connection refused" }]]),
  );
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.equal(r.errored.length, 1);
  assert.equal(r.errored[0]!.id, "b1");
  assert.match(r.errored[0]!.reason, /connection refused/);
  // Status should still be FOUND for next tick.
  assert.equal(prisma._rows[0].status, "FOUND");
});

test("multiple blocks processed independently", async () => {
  const prisma = fakePrisma([
    { id: "b1", hash: "h1" },
    { id: "b2", hash: "h2" },
    { id: "b3", hash: "h3" },
  ]);
  const rpc = fakeRpc(
    new Map<string, { confirmations: number } | { error: string }>([
      ["h1", { confirmations: 150 }],
      ["h2", { confirmations: -1 }],
      ["h3", { confirmations: 50 }],
    ]),
  );
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 100 });
  assert.deepEqual(r.matured, ["b1"]);
  assert.deepEqual(r.orphaned, ["b2"]);
  assert.equal(r.errored.length, 0);
});

test("custom maturityConfs threshold honored", async () => {
  const prisma = fakePrisma([{ id: "b1", hash: "h1" }]);
  const rpc = fakeRpc(new Map([["h1", { confirmations: 6 }]]));
  const r = await checkMaturity({ prisma, rpc, maturityConfs: 6 });
  assert.deepEqual(r.matured, ["b1"]);
});
