// Server-side TTL-cached wrapper around `fetchNostrProfile`. Used by
// the OperatorBadge server component; the cache survives across requests
// in the same Node process so we don't hammer relays on every page view.

import { fetchNostrProfile, type NostrProfile } from "./profile";
import { HASHDEN_RELAYS } from "../env";

export interface OperatorProfile extends NostrProfile {
  /** ISO timestamp the profile was fetched (informational). */
  fetchedAt: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { profile: OperatorProfile; expiresAt: number }>();

export async function fetchOperatorProfile(
  pubkey: string,
  opts: { timeoutMs?: number } = {},
): Promise<OperatorProfile | null> {
  const cached = cache.get(pubkey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }
  const profile = await fetchNostrProfile(pubkey, HASHDEN_RELAYS, opts);
  if (!profile) return null;
  const op: OperatorProfile = { ...profile, fetchedAt: new Date().toISOString() };
  cache.set(pubkey, { profile: op, expiresAt: Date.now() + CACHE_TTL_MS });
  return op;
}
