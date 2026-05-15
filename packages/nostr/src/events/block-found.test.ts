import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlockFoundEvent } from "./block-found.js";

const PROJ_PK = "ab".repeat(32);
const MEMBER_PK = "cd".repeat(32);
const HASH = "01".repeat(32);

test("builds kind-1 with d/app/block/hash tags", () => {
  const e = buildBlockFoundEvent({
    projectPubkey: PROJ_PK,
    content: {
      slug: "demo",
      height: 946926,
      blockHash: HASH,
      rewardSats: "313625400",
    },
    createdAt: 1700000000,
  });
  assert.equal(e.kind, 1);
  assert.equal(e.pubkey, PROJ_PK);
  const tagFor = (k: string) => e.tags.find((t) => t[0] === k);
  assert.deepEqual(tagFor("d"), ["d", "demo"]);
  assert.deepEqual(tagFor("app"), ["app", "hashden"]);
  assert.deepEqual(tagFor("block"), ["block", "946926"]);
  assert.deepEqual(tagFor("hash"), ["hash", HASH]);
  assert.equal(tagFor("p"), undefined); // no winner pubkey for PPLNS
});

test("solo-showcase block includes winner p-tag", () => {
  const e = buildBlockFoundEvent({
    projectPubkey: PROJ_PK,
    content: {
      slug: "solo",
      height: 946926,
      blockHash: HASH,
      rewardSats: "313625400",
      winnerPubkey: MEMBER_PK,
    },
  });
  assert.deepEqual(
    e.tags.find((t) => t[0] === "p"),
    ["p", MEMBER_PK],
  );
});

test("default note generated when none provided", () => {
  const e = buildBlockFoundEvent({
    projectPubkey: PROJ_PK,
    content: {
      slug: "demo",
      height: 946926,
      blockHash: HASH,
      rewardSats: "313625400",
    },
  });
  assert.match(e.content, /demo found block 946926/);
  assert.match(e.content, /313625400 sats/);
});

test("custom note overrides default", () => {
  const e = buildBlockFoundEvent({
    projectPubkey: PROJ_PK,
    content: {
      slug: "demo",
      height: 946926,
      blockHash: HASH,
      rewardSats: "1000",
      note: "operator runs Knots",
    },
  });
  assert.equal(e.content, "operator runs Knots");
});

test("rejects invalid block hash", () => {
  assert.throws(() =>
    buildBlockFoundEvent({
      projectPubkey: PROJ_PK,
      content: {
        slug: "demo",
        height: 1,
        blockHash: "abc",
        rewardSats: "1",
      },
    }),
  );
});

test("rejects negative rewardSats string", () => {
  assert.throws(() =>
    buildBlockFoundEvent({
      projectPubkey: PROJ_PK,
      content: {
        slug: "demo",
        height: 1,
        blockHash: HASH,
        rewardSats: "-100",
      },
    }),
  );
});
