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
  // Per-den PPLNS dust threshold in sats. BigInt serialized as decimal
  // string; parse with BigInt() or Number() depending on need.
  dustThresholdSats: string;
  createdAt: string;
  // Only populated by `/groups/by/:pubkey` when the queried pubkey is a
  // member (not operator) of this den. null otherwise. Powers the per-den
  // "Show my npub publicly" toggle on /me.
  memberShowPubkey?: boolean | null;
  // Whether the operator has configured each optional credential.
  // Surfaced so /settings can show "Currently configured" badges instead
  // of looking like the secret was cleared every time the page loads.
  hasOperatorRpcAuth: boolean;
  hasOperatorLnSecret: boolean;
  // Backend type for the configured LN wallet, if any. null when no
  // wallet is set. The secret itself is never returned.
  operatorLnType: "LNBITS" | "NWC" | null;
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
  // Operator's Lightning wallet for PPLNS dust fan-out. Both fields go
  // together or both omitted; secret is encrypted at rest on the server.
  operatorLnType?: "LNBITS" | "NWC";
  operatorLnSecret?: string;
  // Operator-as-member auto-join. Both fields together or both omitted.
  // Server uses the operator's pubkey + these addresses to insert a
  // Member row, so the operator can point hardware at their own den
  // immediately without a separate /join step.
  memberBtcAddress?: string;
  memberLightningAddress?: string;
  // Per-den dust threshold override, in sats. Empty/undefined keeps
  // the default on create and the existing value on update.
  dustThresholdSats?: string;
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

// Authenticated fetch of the caller's OWN member record (private payout
// addresses) to pre-fill the manage-payout form. signedEvent must be a fresh
// kind-30078 with d-tag `member-record:<slug>` signed by the member's NIP-07.
export async function getMyMemberRecord(
  slug: string,
  signedEvent: unknown,
): Promise<{ btcAddress: string; lightningAddress: string; showPubkey: boolean }> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/members/record`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getMyMemberRecord failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    btcAddress: string;
    lightningAddress: string;
    showPubkey: boolean;
  };
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
  /** Distinct workers (rigs) active in the window — a unique (member, rig-id) pair. */
  workerCount: number;
  shares: { memberPubkey: string; difficulty: number; ts: string }[];
}

export interface GroupHashrate {
  group: { slug: string };
  windowMinutes: number;
  bucketMinutes: number;
  currentWindowMinutes: number;
  currentHashrateHs: string;
  currentShareCount: number;
  buckets: { ts: string; hashrateHs: string; shareCount: number }[];
}

export interface MemberStats {
  pubkey: string;
  windowMinutes: number;
  currentWindowMinutes: number;
  currentHashrateHs: string;
  currentShareCount: number;
  perDen: { slug: string; hashrateHs: string; shareCount: number }[];
}

export async function getMemberStats(
  pubkey: string,
  windowMinutes?: number,
): Promise<MemberStats> {
  const params = new URLSearchParams();
  if (windowMinutes != null)
    params.set("windowMinutes", windowMinutes.toString());
  const url = `${apiBase()}/hashden/members/${encodeURIComponent(pubkey)}/stats${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getMemberStats failed: ${res.status}`);
  return (await res.json()) as MemberStats;
}

export async function getGroupHashrate(
  slug: string,
  opts: { windowMinutes?: number; buckets?: number } = {},
): Promise<GroupHashrate> {
  const params = new URLSearchParams();
  if (opts.windowMinutes != null)
    params.set("windowMinutes", opts.windowMinutes.toString());
  if (opts.buckets != null) params.set("buckets", opts.buckets.toString());
  const url = `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/hashrate${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getGroupHashrate failed: ${res.status}`);
  return (await res.json()) as GroupHashrate;
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

// Per-den operator dashboard aggregate (powers the /me operated-den cards).
// All numbers are derived from already-public block data; leaderboard
// memberPubkeys are anonymized per-den unless the member opted in.
export interface OperatorStats {
  group: { slug: string };
  /** ISO timestamp of the most recent block of any status, or null. */
  lastBlockAt: string | null;
  blockCount: number;
  /** Accumulated across all non-orphaned blocks. Decimal strings (BigInt-safe). */
  operatorFeeSats: string;
  platformFeeSats: string;
  /** Top members by accumulated on-chain reward. memberPubkey may be an
   *  `anon-…` id for members who haven't opted into public display. */
  leaderboard: { memberPubkey: string; rewardSats: string }[];
}

export async function getOperatorStats(slug: string): Promise<OperatorStats> {
  const res = await fetch(
    `${apiBase()}/hashden/groups/${encodeURIComponent(slug)}/operator-stats`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`getOperatorStats failed: ${res.status}`);
  return (await res.json()) as OperatorStats;
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
