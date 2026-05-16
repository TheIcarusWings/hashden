// Hashden API client (talks to apps/stratum's REST endpoints).
// Used both in server components (via fetch on Node) and client
// components (via fetch in the browser).

import { HASHDEN_API_URL, HASHDEN_API_URL_SERVER } from "./env";

// Server-rendered pages run in Node (no `window`); browser components
// run with `window` defined. Server uses the internal service hostname
// (faster + bypasses Traefik); browser uses the public hostname.
function apiBase(): string {
  return typeof window === "undefined" ? HASHDEN_API_URL_SERVER : HASHDEN_API_URL;
}

export interface PublicGroup {
  slug: string;
  name: string;
  description: string;
  feeBps: number;
  payoutRule: "SOLO_SHOWCASE" | "PPLNS";
  templateSource: "PLATFORM_DEFAULT" | "OPERATOR_RPC";
  operatorPubkey: string;
  operatorBtcAddress: string;
  visibility: "PUBLIC" | "UNLISTED" | "DELETED";
  createdAt: string;
  // Only populated by `/groups/by/:pubkey` when the queried pubkey is a
  // member (not operator) of this den. null otherwise. Powers the per-den
  // "Show my npub publicly" toggle on /me.
  memberShowPubkey?: boolean | null;
}

export async function listGroups(): Promise<PublicGroup[]> {
  const res = await fetch(`${apiBase()}/hashden/groups`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`listGroups failed: ${res.status}`);
  }
  const json = (await res.json()) as { groups: PublicGroup[] };
  return json.groups;
}

// Dens that pubkey operates or is a member of, regardless of visibility.
// Used by /me to show the user's own dens (including UNLISTED ones).
export async function listGroupsForPubkey(
  pubkey: string,
): Promise<PublicGroup[]> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/by/${encodeURIComponent(pubkey)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`listGroupsForPubkey failed: ${res.status}`);
  }
  const json = (await res.json()) as { groups: PublicGroup[] };
  return json.groups;
}

export async function getGroup(slug: string): Promise<PublicGroup | null> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getGroup failed: ${res.status}`);
  return (await res.json()) as PublicGroup;
}

export async function createGroup(body: {
  signedEvent: unknown;
  operatorRpcUrl?: string;
  operatorRpcAuth?: string;
}): Promise<{ slug: string }> {
  const res = await fetch(`${apiBase()}/hashden/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createGroup failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { slug: string };
}

export async function joinGroup(
  slug: string,
  signedEvent: unknown,
): Promise<{ ok: true; memberPubkey: string }> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/members`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`joinGroup failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ok: true; memberPubkey: string };
}

// Update display preferences for an existing member (no address re-entry).
// signedEvent must be a kind-30078 with d-tag `member-prefs:<slug>` and
// content `{show_pubkey: boolean}` signed by the member's NIP-07.
export async function setMemberPreferences(
  slug: string,
  signedEvent: unknown,
): Promise<{ ok: true; memberPubkey: string; showPubkey: boolean }> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/members/preferences`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`setMemberPreferences failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    ok: true;
    memberPubkey: string;
    showPubkey: boolean;
  };
}

// Operator soft-delete. `signedEvent` is a NIP-09 kind-5 event addressing
// the den's kind-30078 via an `a` tag, signed by the operator's NIP-07.
// Server returns 410 Gone on subsequent reads.
export async function deleteGroup(
  slug: string,
  signedEvent: unknown,
): Promise<{ slug: string; visibility: "DELETED" }> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/delete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteGroup failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { slug: string; visibility: "DELETED" };
}

export interface GroupShares {
  group: { slug: string; payoutRule: string };
  sinceMinutes: number;
  count: number;
  shares: { memberPubkey: string; difficulty: number; ts: string }[];
}

export async function getGroupShares(
  slug: string,
  opts: { sinceMinutes?: number; limit?: number } = {},
): Promise<GroupShares> {
  const params = new URLSearchParams();
  if (opts.sinceMinutes != null)
    params.set("sinceMinutes", opts.sinceMinutes.toString());
  if (opts.limit != null) params.set("limit", opts.limit.toString());
  const url = `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/shares${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getGroupShares failed: ${res.status}`);
  return (await res.json()) as GroupShares;
}

export interface GroupBlocks {
  group: { slug: string };
  count: number;
  blocks: {
    id: string;
    height: number;
    hash: string;
    rewardSats: string;
    status: string;
    foundAt: string;
    maturedAt: string | null;
  }[];
}

export async function getGroupBlocks(
  slug: string,
  limit = 25,
): Promise<GroupBlocks> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/blocks?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`getGroupBlocks failed: ${res.status}`);
  return (await res.json()) as GroupBlocks;
}

export interface CoinbasePreview {
  group: {
    slug: string;
    payoutRule: "PPLNS" | "SOLO_SHOWCASE";
    feeBps: number;
    operatorBtcAddress: string;
  };
  blockRewardSats: string;
  outputs: {
    // null for MEMBER-kind outputs in the preview — the stratum redacts
    // payout addresses until a block is actually found, so visitors can't
    // read off the membership roster's addresses.
    address: string | null;
    sats: string;
    kind: "MEMBER" | "OPERATOR_FEE" | "PLATFORM_FEE" | "DUST_BUCKET";
    memberPubkey?: string;
  }[];
  dustBreakdown: { memberPubkey: string; owedSats: string }[];
  membersInWindow: number;
  note: string;
}

export async function getCoinbasePreview(
  slug: string,
): Promise<CoinbasePreview> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/coinbase-preview`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`getCoinbasePreview failed: ${res.status}`);
  return (await res.json()) as CoinbasePreview;
}

export interface GroupPayouts {
  group: { slug: string };
  count: number;
  payouts: {
    id: string;
    memberPubkey: string;
    amountSats: string;
    kind: "ON_CHAIN_COINBASE" | "LN_DUST";
    status: "PENDING" | "IN_FLIGHT" | "PAID" | "FAILED";
    lnPaymentHash: string | null;
    zapEventId: string | null;
    attemptedAt: string;
    blockHeight: number;
    blockHash: string;
  }[];
}

export async function getGroupPayouts(
  slug: string,
  limit = 50,
): Promise<GroupPayouts> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/payouts?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`getGroupPayouts failed: ${res.status}`);
  return (await res.json()) as GroupPayouts;
}

export async function probeLnurl(
  lightningAddress: string,
): Promise<
  | { ok: true; minSendable: number; maxSendable: number; callback: string }
  | { ok: false; reason: string }
> {
  const res = await fetch(`${apiBase()}/hashden/lnurl/probe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lightningAddress }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `HTTP ${res.status}: ${text}` };
  }
  return (await res.json()) as Awaited<ReturnType<typeof probeLnurl>>;
}

export async function testOperatorRpc(args: {
  url: string;
  auth: string;
}): Promise<
  | { ok: true; height: number }
  | { ok: false; reason: string }
> {
  const res = await fetch(
    `${apiBase()}/hashden/operator-templates/test`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `HTTP ${res.status}: ${text}` };
  }
  return (await res.json()) as Awaited<ReturnType<typeof testOperatorRpc>>;
}
