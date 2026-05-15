// Kind 30078 — Hashden group metadata.
//
// Hashden uses a NIP-33 parameterized replaceable event to publish a
// group's operator-signed metadata. The `d` tag is the group slug,
// uniquely identifying the group within the operator's pubkey scope.
// Replaying the event with the same (pubkey, kind, d) replaces the
// previous version on relays.
//
// Spec choice: kind 30078 ("application-specific data") rather than a
// custom range, per NIP-78 conventions for arbitrary app data. Tag the
// event with `["app", "hashden"]` so consumers can filter ours apart
// from other 30078 events.

import type { UnsignedEvent } from "../nip07.js";

export type PayoutRule = "SOLO_SHOWCASE" | "PPLNS";
export type TemplateSource = "PLATFORM_DEFAULT" | "OPERATOR_RPC";
export type Visibility = "PUBLIC" | "UNLISTED";

export interface GroupMetadataContent {
  /** Display name shown in the marketplace. */
  name: string;
  /** Long-form description (markdown allowed; rendered via DOMPurify). */
  description: string;
  /** Operator fee in basis points (200 = 2%). */
  fee_bps: number;
  payout_rule: PayoutRule;
  template_source: TemplateSource;
  /** BTC address that receives the operator-fee + dust-bucket coinbase outputs. */
  operator_btc_address: string;
  /** Stratum URL for miners; informational (operators may run their own). */
  stratum_url?: string;
  /** PUBLIC = listed in marketplace, UNLISTED = link-only. Defaults to PUBLIC when omitted (back-compat with kind-30078 events from older clients). */
  visibility?: Visibility;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBKEY_RE = /^[0-9a-f]{64}$/;

export function buildGroupMetadataEvent(args: {
  operatorPubkey: string;
  slug: string;
  content: GroupMetadataContent;
  /** Optional override for testing; defaults to current time. */
  createdAt?: number;
}): UnsignedEvent {
  if (!PUBKEY_RE.test(args.operatorPubkey)) {
    throw new Error("operatorPubkey must be 64 hex chars");
  }
  if (!SLUG_RE.test(args.slug)) {
    throw new Error("slug must match /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/");
  }
  validateContent(args.content);

  const visibility = args.content.visibility ?? "PUBLIC";
  return {
    kind: 30078,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: args.operatorPubkey,
    tags: [
      ["d", args.slug],
      ["app", "hashden"],
      ["payout_rule", args.content.payout_rule],
      ["template_source", args.content.template_source],
      ["visibility", visibility],
    ],
    content: JSON.stringify(args.content),
  };
}

export function parseGroupMetadataContent(
  raw: string,
): { ok: true; content: GroupMetadataContent } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "NOT_OBJECT" };
  }
  const o = parsed as Partial<GroupMetadataContent>;
  if (typeof o.name !== "string" || o.name.length === 0) {
    return { ok: false, reason: "MISSING_NAME" };
  }
  if (typeof o.description !== "string") {
    return { ok: false, reason: "MISSING_DESCRIPTION" };
  }
  if (
    typeof o.fee_bps !== "number" ||
    !Number.isInteger(o.fee_bps) ||
    o.fee_bps < 0 ||
    o.fee_bps > 10_000
  ) {
    return { ok: false, reason: "INVALID_FEE_BPS" };
  }
  if (o.payout_rule !== "SOLO_SHOWCASE" && o.payout_rule !== "PPLNS") {
    return { ok: false, reason: "INVALID_PAYOUT_RULE" };
  }
  if (
    o.template_source !== "PLATFORM_DEFAULT" &&
    o.template_source !== "OPERATOR_RPC"
  ) {
    return { ok: false, reason: "INVALID_TEMPLATE_SOURCE" };
  }
  if (
    typeof o.operator_btc_address !== "string" ||
    o.operator_btc_address.length === 0
  ) {
    return { ok: false, reason: "MISSING_OPERATOR_BTC_ADDRESS" };
  }
  if (
    o.visibility !== undefined &&
    o.visibility !== "PUBLIC" &&
    o.visibility !== "UNLISTED"
  ) {
    return { ok: false, reason: "INVALID_VISIBILITY" };
  }
  return {
    ok: true,
    content: {
      name: o.name,
      description: o.description,
      fee_bps: o.fee_bps,
      payout_rule: o.payout_rule,
      template_source: o.template_source,
      operator_btc_address: o.operator_btc_address,
      stratum_url: typeof o.stratum_url === "string" ? o.stratum_url : undefined,
      visibility: o.visibility ?? "PUBLIC",
    },
  };
}

function validateContent(c: GroupMetadataContent): void {
  if (!c.name) throw new Error("content.name required");
  if (typeof c.description !== "string") throw new Error("content.description required (string)");
  if (
    !Number.isInteger(c.fee_bps) ||
    c.fee_bps < 0 ||
    c.fee_bps > 10_000
  ) {
    throw new Error("content.fee_bps must be integer 0..10000");
  }
  if (c.payout_rule !== "SOLO_SHOWCASE" && c.payout_rule !== "PPLNS") {
    throw new Error("content.payout_rule must be SOLO_SHOWCASE or PPLNS");
  }
  if (
    c.template_source !== "PLATFORM_DEFAULT" &&
    c.template_source !== "OPERATOR_RPC"
  ) {
    throw new Error(
      "content.template_source must be PLATFORM_DEFAULT or OPERATOR_RPC",
    );
  }
  if (!c.operator_btc_address) {
    throw new Error("content.operator_btc_address required");
  }
  if (
    c.visibility !== undefined &&
    c.visibility !== "PUBLIC" &&
    c.visibility !== "UNLISTED"
  ) {
    throw new Error("content.visibility must be PUBLIC or UNLISTED");
  }
}
