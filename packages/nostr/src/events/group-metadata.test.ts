import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupMetadataEvent,
  parseGroupMetadataContent,
  type GroupMetadataContent,
} from "./group-metadata.js";

const PK = "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

const VALID_CONTENT: GroupMetadataContent = {
  name: "Demo Den",
  description: "A demo group for testing.",
  fee_bps: 200,
  payout_rule: "PPLNS",
  template_source: "PLATFORM_DEFAULT",
  operator_btc_address: "bc1qoperator",
  stratum_url: "stratum+tcp://stratum.hashden.app:3333",
};

test("buildGroupMetadataEvent: valid input → kind 30078 with d-tag and app-tag", () => {
  const e = buildGroupMetadataEvent({
    operatorPubkey: PK,
    slug: "demo-den",
    content: VALID_CONTENT,
    createdAt: 1700000000,
  });
  assert.equal(e.kind, 30078);
  assert.equal(e.created_at, 1700000000);
  assert.equal(e.pubkey, PK);
  assert.deepEqual(
    e.tags.find((t) => t[0] === "d"),
    ["d", "demo-den"],
  );
  assert.deepEqual(
    e.tags.find((t) => t[0] === "app"),
    ["app", "hashden"],
  );
  assert.deepEqual(
    e.tags.find((t) => t[0] === "payout_rule"),
    ["payout_rule", "PPLNS"],
  );
});

test("buildGroupMetadataEvent: rejects invalid slug", () => {
  assert.throws(() =>
    buildGroupMetadataEvent({
      operatorPubkey: PK,
      slug: "Bad-Slug-Caps",
      content: VALID_CONTENT,
    }),
  );
});

test("buildGroupMetadataEvent: rejects invalid pubkey", () => {
  assert.throws(() =>
    buildGroupMetadataEvent({
      operatorPubkey: "not-a-pubkey",
      slug: "demo",
      content: VALID_CONTENT,
    }),
  );
});

test("buildGroupMetadataEvent: rejects fee_bps > 10000", () => {
  assert.throws(() =>
    buildGroupMetadataEvent({
      operatorPubkey: PK,
      slug: "demo",
      content: { ...VALID_CONTENT, fee_bps: 10001 },
    }),
  );
});

test("parseGroupMetadataContent: round-trips a built event", () => {
  const e = buildGroupMetadataEvent({
    operatorPubkey: PK,
    slug: "demo",
    content: VALID_CONTENT,
  });
  const parsed = parseGroupMetadataContent(e.content);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.content.name, VALID_CONTENT.name);
    assert.equal(parsed.content.fee_bps, VALID_CONTENT.fee_bps);
    assert.equal(parsed.content.payout_rule, VALID_CONTENT.payout_rule);
    assert.equal(
      parsed.content.operator_btc_address,
      VALID_CONTENT.operator_btc_address,
    );
  }
});

test("parseGroupMetadataContent: rejects garbage", () => {
  assert.equal(parseGroupMetadataContent("not json").ok, false);
  assert.equal(parseGroupMetadataContent("123").ok, false);
  assert.equal(parseGroupMetadataContent('{"name":"x"}').ok, false);
});

test("parseGroupMetadataContent: rejects invalid payout_rule", () => {
  const r = parseGroupMetadataContent(
    JSON.stringify({ ...VALID_CONTENT, payout_rule: "MYSTERY" }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_PAYOUT_RULE");
});

test("parseGroupMetadataContent: rejects negative fee_bps", () => {
  const r = parseGroupMetadataContent(
    JSON.stringify({ ...VALID_CONTENT, fee_bps: -1 }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "INVALID_FEE_BPS");
});
