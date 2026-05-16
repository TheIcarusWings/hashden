"use client";

import { useEffect, useState } from "react";
import { fetchNostrProfile, type NostrProfile } from "./profile";
import { HASHDEN_RELAYS } from "../env";

// Page-load-scoped cache. Profiles rarely change; refetching every time
// the user navigates back to /me wastes a relay round-trip.
const cache = new Map<string, NostrProfile | null>();
const inflight = new Map<string, Promise<NostrProfile | null>>();

export type ProfileState =
  | { kind: "LOADING" }
  | { kind: "LOADED"; profile: NostrProfile | null };

export function useNostrProfile(pubkey: string | null): ProfileState {
  const [state, setState] = useState<ProfileState>(() => {
    if (!pubkey) return { kind: "LOADED", profile: null };
    if (cache.has(pubkey)) {
      return { kind: "LOADED", profile: cache.get(pubkey) ?? null };
    }
    return { kind: "LOADING" };
  });

  useEffect(() => {
    if (!pubkey) {
      setState({ kind: "LOADED", profile: null });
      return;
    }
    if (cache.has(pubkey)) {
      setState({ kind: "LOADED", profile: cache.get(pubkey) ?? null });
      return;
    }
    let cancelled = false;
    setState({ kind: "LOADING" });
    let promise = inflight.get(pubkey);
    if (!promise) {
      promise = fetchNostrProfile(pubkey, HASHDEN_RELAYS);
      inflight.set(pubkey, promise);
    }
    promise.then((profile) => {
      cache.set(pubkey, profile);
      inflight.delete(pubkey);
      if (!cancelled) setState({ kind: "LOADED", profile });
    });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  return state;
}
