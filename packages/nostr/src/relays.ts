// Multi-relay publish helper.
//
// Publishes a signed event to N relays in parallel; resolves with a per-
// relay status array so callers can show granular success/failure to
// users. The "minimum publish count" rule is enforced by the caller —
// e.g. the group create flow requires ≥2 successes before persisting
// the Postgres cache row.

import { Relay } from "nostr-tools/relay";
import type { SignedEvent } from "./nip07.js";

export interface PublishResult {
  url: string;
  ok: boolean;
  /** Relay's response or error message. */
  reason?: string;
}

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
] as const;

export interface PublishOptions {
  /** Per-relay timeout. Defaults to 5000ms. */
  timeoutMs?: number;
}

export async function publishToRelays(
  event: SignedEvent,
  relayUrls: readonly string[] = DEFAULT_RELAYS,
  options: PublishOptions = {},
): Promise<PublishResult[]> {
  const timeoutMs = options.timeoutMs ?? 5000;
  return Promise.all(
    relayUrls.map((url) => publishToOne(event, url, timeoutMs)),
  );
}

async function publishToOne(
  event: SignedEvent,
  url: string,
  timeoutMs: number,
): Promise<PublishResult> {
  let relay: Relay | null = null;
  try {
    relay = await raceTimeout(Relay.connect(url), timeoutMs, "connect timeout");
    await raceTimeout(
      // nostr-tools v2: Relay.publish returns void on success, throws on failure.
      relay.publish(event as unknown as Parameters<Relay["publish"]>[0]),
      timeoutMs,
      "publish timeout",
    );
    return { url, ok: true };
  } catch (err) {
    return { url, ok: false, reason: (err as Error).message };
  } finally {
    try {
      relay?.close();
    } catch {
      /* swallow close errors */
    }
  }
}

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
