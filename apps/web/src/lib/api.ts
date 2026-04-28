// Hashden API client (talks to apps/stratum's REST endpoints).
// Used both in server components (via fetch on Node) and client
// components (via fetch in the browser).

import { HASHDEN_API_URL } from "./env";

export interface PublicGroup {
  slug: string;
  name: string;
  description: string;
  feeBps: number;
  payoutRule: "SOLO_SHOWCASE" | "PPLNS";
  templateSource: "PLATFORM_DEFAULT" | "OPERATOR_RPC";
  operatorPubkey: string;
  operatorBtcAddress: string;
  createdAt: string;
}

export async function listGroups(): Promise<PublicGroup[]> {
  const res = await fetch(`${HASHDEN_API_URL}/hashden/groups`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`listGroups failed: ${res.status}`);
  }
  const json = (await res.json()) as { groups: PublicGroup[] };
  return json.groups;
}

export async function getGroup(slug: string): Promise<PublicGroup | null> {
  const res = await fetch(
    `${HASHDEN_API_URL}/hashden/groups/${encodeURIComponent(slug)}`,
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
  const res = await fetch(`${HASHDEN_API_URL}/hashden/groups`, {
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
    `${HASHDEN_API_URL}/hashden/groups/${encodeURIComponent(slug)}/members`,
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
  const url = `${HASHDEN_API_URL}/hashden/groups/${encodeURIComponent(slug)}/shares${params.toString() ? `?${params}` : ""}`;
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
    `${HASHDEN_API_URL}/hashden/groups/${encodeURIComponent(slug)}/blocks?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`getGroupBlocks failed: ${res.status}`);
  return (await res.json()) as GroupBlocks;
}

export async function probeLnurl(
  lightningAddress: string,
): Promise<
  | { ok: true; minSendable: number; maxSendable: number; callback: string }
  | { ok: false; reason: string }
> {
  const res = await fetch(`${HASHDEN_API_URL}/hashden/lnurl/probe`, {
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
    `${HASHDEN_API_URL}/hashden/operator-templates/test`,
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
