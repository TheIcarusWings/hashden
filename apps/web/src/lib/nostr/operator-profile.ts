// Operator profile fetcher.
//
// Pulls a Nostr kind-0 (metadata) event for a given pubkey from the
// configured relay set, parses the typical fields (name, picture,
// about), and caches the result in-process for 5 minutes. Server-side
// only — uses node-friendly nostr-tools APIs.

import { Relay } from "nostr-tools/relay";
import { HASHDEN_RELAYS } from "../env";

export interface OperatorProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  /** ISO timestamp the profile was fetched (informational). */
  fetchedAt: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { profile: OperatorProfile; expiresAt: number }>();

/**
 * Returns the operator's parsed kind-0 metadata, racing all configured
 * relays and taking the first one that returns. Returns null if no
 * relay produced a profile within the timeout (caller renders a
 * fallback like the truncated pubkey).
 */
export async function fetchOperatorProfile(
  pubkey: string,
  opts: { timeoutMs?: number } = {},
): Promise<OperatorProfile | null> {
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    return null;
  }
  const cached = cache.get(pubkey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const timeoutMs = opts.timeoutMs ?? 3_000;
  const profile = await Promise.race([
    raceRelays(pubkey, HASHDEN_RELAYS, timeoutMs),
    timeoutTo<null>(timeoutMs + 500, null),
  ]);
  if (profile) {
    cache.set(pubkey, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return profile;
}

async function raceRelays(
  pubkey: string,
  urls: string[],
  timeoutMs: number,
): Promise<OperatorProfile | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let pending = urls.length;
    const onResult = (p: OperatorProfile | null) => {
      if (resolved) return;
      if (p) {
        resolved = true;
        resolve(p);
      } else if (--pending <= 0) {
        resolved = true;
        resolve(null);
      }
    };
    for (const url of urls) {
      void fetchFromRelay(pubkey, url, timeoutMs).then(onResult).catch(() => onResult(null));
    }
  });
}

async function fetchFromRelay(
  pubkey: string,
  url: string,
  timeoutMs: number,
): Promise<OperatorProfile | null> {
  let relay: Relay | null = null;
  return new Promise<OperatorProfile | null>((resolve) => {
    let done = false;
    const finish = (p: OperatorProfile | null) => {
      if (done) return;
      done = true;
      try {
        relay?.close();
      } catch {
        /* swallow */
      }
      resolve(p);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    Relay.connect(url)
      .then((r) => {
        relay = r;
        const sub = r.subscribe(
          [{ kinds: [0], authors: [pubkey], limit: 1 }],
          {
            onevent: (event) => {
              clearTimeout(timer);
              const parsed = parseProfileContent(event.content, pubkey);
              sub.close();
              finish(parsed);
            },
            oneose: () => {
              // End of stored events with no match.
              clearTimeout(timer);
              sub.close();
              finish(null);
            },
          },
        );
      })
      .catch(() => {
        clearTimeout(timer);
        finish(null);
      });
  });
}

function parseProfileContent(content: string, pubkey: string): OperatorProfile | null {
  try {
    const o = JSON.parse(content);
    return {
      pubkey,
      name: typeof o.name === "string" ? o.name : undefined,
      displayName:
        typeof o.display_name === "string" ? o.display_name : undefined,
      picture: typeof o.picture === "string" ? o.picture : undefined,
      about: typeof o.about === "string" ? o.about : undefined,
      nip05: typeof o.nip05 === "string" ? o.nip05 : undefined,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function timeoutTo<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
