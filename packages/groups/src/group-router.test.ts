import { test } from "node:test";
import assert from "node:assert/strict";
import { GroupRouter, type PrismaLike } from "./group-router.js";

const VALID_PUBKEY =
  "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

function fakePrisma(opts: {
  group?: { id: string } | null;
  member?: { groupId: string; btcAddress: string } | null;
}): PrismaLike {
  return {
    group: {
      findUnique: async () => opts.group ?? null,
    },
    member: {
      findUnique: async () => opts.member ?? null,
    },
  };
}

test("invalid worker name → INVALID_NAME", async () => {
  const router = new GroupRouter(fakePrisma({}));
  const r = await router.route("not.a.real.username.with.too.many.parts");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "INVALID_NAME");
    assert.equal(r.detail, "TOO_MANY_PARTS");
  }
});

test("empty worker name → INVALID_NAME with EMPTY detail", async () => {
  const router = new GroupRouter(fakePrisma({}));
  const r = await router.route("");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "INVALID_NAME");
    assert.equal(r.detail, "EMPTY");
  }
});

test("valid name but unknown slug → GROUP_NOT_FOUND", async () => {
  const router = new GroupRouter(fakePrisma({ group: null }));
  const r = await router.route(`unknown.${VALID_PUBKEY}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "GROUP_NOT_FOUND");
});

test("known group but unregistered pubkey → NOT_MEMBER", async () => {
  const router = new GroupRouter(
    fakePrisma({ group: { id: "g_1" }, member: null }),
  );
  const r = await router.route(`demo.${VALID_PUBKEY}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "NOT_MEMBER");
});

test("registered member in known group → ok", async () => {
  const router = new GroupRouter(
    fakePrisma({
      group: { id: "g_1" },
      member: { groupId: "g_1", btcAddress: "bc1qmember" },
    }),
  );
  const r = await router.route(`demo.${VALID_PUBKEY}.bitaxe-01`);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.groupId, "g_1");
    assert.equal(r.memberPubkey, VALID_PUBKEY);
    assert.equal(r.btcAddress, "bc1qmember");
    assert.equal(r.workerId, "bitaxe-01");
  }
});

test("registered member without worker id → ok with workerId=null", async () => {
  const router = new GroupRouter(
    fakePrisma({
      group: { id: "g_1" },
      member: { groupId: "g_1", btcAddress: "bc1qmember" },
    }),
  );
  const r = await router.route(`demo.${VALID_PUBKEY}`);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.workerId, null);
});

test("router queries group by slug then member by composite key", async () => {
  const calls: string[] = [];
  const prisma: PrismaLike = {
    group: {
      findUnique: async (args) => {
        calls.push(`group.findUnique:${args.where.slug}`);
        return { id: "g_1" };
      },
    },
    member: {
      findUnique: async (args) => {
        const k = args.where.groupId_memberPubkey;
        calls.push(`member.findUnique:${k.groupId}/${k.memberPubkey.slice(0, 6)}`);
        return { groupId: k.groupId, btcAddress: "bc1qmember" };
      },
    },
  };
  const router = new GroupRouter(prisma);
  await router.route(`demo.${VALID_PUBKEY}`);
  assert.deepEqual(calls, [
    "group.findUnique:demo",
    `member.findUnique:g_1/${VALID_PUBKEY.slice(0, 6)}`,
  ]);
});
