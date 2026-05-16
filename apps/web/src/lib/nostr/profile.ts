// Isomorphic Nostr profile fetcher.
//
// Pulls a kind-0 (metadata) event for a given pubkey from the configured
// relay set, racing all of them and returning the first hit. Works on
// both server (Node) and client (browser) — nostr-tools/relay uses the
// platform's WebSocket either way.
//
// No caching here. Callers add the caching strategy that fits their
// runtime: server uses a TTL Map (see operator-profile.ts), client uses
// a per-page-load singleton + React state (see useNostrProfile.ts).

import { Relay } from "nostr-tools/relay";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export async function fetchNostrProfile(
  pubkey: string,
  relays: string[],
  opts: { timeoutMs?: number } = {},
): Promise<NostrProfile | null> {
  if (!/^[0-9a-f]{64}$/.test(pubkey)) return null;
  const timeoutMs = opts.timeoutMs ?? 3_000;
  return Promise.race([
    raceRelays(pubkey, relays, timeoutMs),
    timeoutTo<null>(timeoutMs + 500, null),
  ]);
}

async function raceRelays(
  pubkey: string,
  urls: string[],
  timeoutMs: number,
): Promise<NostrProfile | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let pending = urls.length;
    const onResult = (p: NostrProfile | null) => {
      if (resolved) return;
      if (p) {
        resolved = true;
        resolve(p);
      } else if (--pending <= 0) {
        resolved = true;
        resolve(null);
      }
    };
    if (urls.length === 0) {
      resolve(null);
      return;
    }
    for (const url of urls) {
      void fetchFromRelay(pubkey, url, timeoutMs)
        .then(onResult)
        .catch(() => onResult(null));
    }
  });
}

async function fetchFromRelay(
  pubkey: string,
  url: string,
  timeoutMs: number,
): Promise<NostrProfile | null> {
  let relay: Relay | null = null;
  return new Promise<NostrProfile | null>((resolve) => {
    let done = false;
    const finish = (p: NostrProfile | null) => {
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

function parseProfileContent(
  content: string,
  pubkey: string,
): NostrProfile | null {
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
    };
  } catch {
    return null;
  }
}

function timeoutTo<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
