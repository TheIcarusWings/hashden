import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberRegistrationEvent,
  type MemberRegistrationContent,
} from "./member-registration.js";

const PK = "02a1b2c3d4e5f60718293a4b5c6d7e8f0102030405060708090a0b0c0d0e0fab";

const VALID_CONTENT: MemberRegistrationContent = {
  btc_address: "bc1qmember",
  lightning_address: "member@walletofsatoshi.com",
};

test("buildMemberRegistrationEvent: valid input → kind 30078 with member d-tag", () => {
  const e = buildMemberRegistrationEvent({
    memberPubkey: PK,
    slug: "demo-den",
    content: VALID_CONTENT,
    createdAt: 1700000000,
  });
  assert.equal(e.kind, 30078);
  assert.equal(e.created_at, 1700000000);
  assert.equal(e.pubkey, PK);
  assert.deepEqual(
    e.tags.find((t) => t[0] === "d"),
    ["d", "member:demo-den"],
  );
  assert.deepEqual(
    e.tags.find((t) => t[0] === "app"),
    ["app", "hashden"],
  );
});

test("buildMemberRegistrationEvent: rejects invalid pubkey", () => {
  assert.throws(() =>
    buildMemberRegistrationEvent({
      memberPubkey: "not-a-pubkey",
      slug: "demo",
      content: VALID_CONTENT,
    }),
  );
});

test("buildMemberRegistrationEvent: rejects invalid lightning address", () => {
  assert.throws(() =>
    buildMemberRegistrationEvent({
      memberPubkey: PK,
      slug: "demo",
      content: { ...VALID_CONTENT, lightning_address: "not-an-address" },
    }),
  );
});

test("buildMemberRegistrationEvent: omits show_pubkey when not provided", () => {
  const e = buildMemberRegistrationEvent({
    memberPubkey: PK,
    slug: "demo",
    content: VALID_CONTENT,
  });
  const parsed = JSON.parse(e.content) as Record<string, unknown>;
  assert.equal("show_pubkey" in parsed, false);
});

test("buildMemberRegistrationEvent: serializes show_pubkey when true", () => {
  const e = buildMemberRegistrationEvent({
    memberPubkey: PK,
    slug: "demo",
    content: { ...VALID_CONTENT, show_pubkey: true },
  });
  const parsed = JSON.parse(e.content) as { show_pubkey?: boolean };
  assert.equal(parsed.show_pubkey, true);
});

test("buildMemberRegistrationEvent: serializes show_pubkey when explicitly false", () => {
  const e = buildMemberRegistrationEvent({
    memberPubkey: PK,
    slug: "demo",
    content: { ...VALID_CONTENT, show_pubkey: false },
  });
  const parsed = JSON.parse(e.content) as { show_pubkey?: boolean };
  assert.equal(parsed.show_pubkey, false);
});

test("buildMemberRegistrationEvent: rejects non-boolean show_pubkey", () => {
  assert.throws(() =>
    buildMemberRegistrationEvent({
      memberPubkey: PK,
      slug: "demo",
      // @ts-expect-error — intentionally invalid type for the guard
      content: { ...VALID_CONTENT, show_pubkey: "yes" },
    }),
  );
});
