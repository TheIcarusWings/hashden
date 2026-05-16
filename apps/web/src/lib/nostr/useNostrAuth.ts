"use client";

import { useCallback, useEffect, useState } from "react";
import { detectNip07, type Nip07Signer } from "@hashden/nostr";

// Connection state for the user's NIP-07 signer. We keep both the
// pubkey AND a live signer reference because the signer is the only
// thing that can sign new events, but the pubkey is what callers
// usually want to read or display.
export type NostrAuthState =
  | { kind: "IDLE" }                             // initial mount, haven't probed yet
  | { kind: "DISCONNECTED" }                      // no extension OR user signed out
  | { kind: "CONNECTING" }                        // user clicked Connect, waiting on signer
  | { kind: "CONNECTED"; pubkey: string; signer: Nip07Signer }
  | { kind: "ERROR"; message: string };

const STORAGE_KEY = "hashden:nostr-pubkey";

// Persisting the *signer* across reloads isn't possible — it's a live
// reference to the browser extension's API. But the pubkey can be
// remembered, and on next mount we ask the extension for its pubkey
// and silently re-pair if it matches. This is the "remember me" flow
// that browsers + wallet extensions are designed to support.
export function useNostrAuth() {
  const [state, setState] = useState<NostrAuthState>({ kind: "IDLE" });

  // Silent reconnect on mount: if we have a remembered pubkey AND the
  // extension is present AND its current pubkey matches, restore
  // CONNECTED without any user prompt. If the extension is present but
  // the pubkey differs (the user changed accounts in the extension),
  // fall through to DISCONNECTED so they explicitly reconnect.
  useEffect(() => {
    let cancelled = false;
    const remembered =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!remembered) {
      setState({ kind: "DISCONNECTED" });
      return;
    }
    const status = detectNip07();
    if (status.kind === "MISSING") {
      setState({ kind: "DISCONNECTED" });
      return;
    }
    status.signer
      .getPublicKey()
      .then((pubkey) => {
        if (cancelled) return;
        if (pubkey === remembered) {
          setState({ kind: "CONNECTED", pubkey, signer: status.signer });
        } else {
          // Pubkey changed in the extension — drop the stale memory
          // so the next interaction starts clean.
          localStorage.removeItem(STORAGE_KEY);
          setState({ kind: "DISCONNECTED" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "DISCONNECTED" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const status = detectNip07();
    if (status.kind === "MISSING") {
      setState({
        kind: "ERROR",
        message: "No NIP-07 signer found. Install Alby or nos2x.",
      });
      return;
    }
    setState({ kind: "CONNECTING" });
    try {
      const pubkey = await status.signer.getPublicKey();
      localStorage.setItem(STORAGE_KEY, pubkey);
      setState({ kind: "CONNECTED", pubkey, signer: status.signer });
    } catch (e) {
      setState({ kind: "ERROR", message: (e as Error).message });
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ kind: "DISCONNECTED" });
  }, []);

  return { state, connect, disconnect };
}
