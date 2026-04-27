// NIP-07 (browser signer) typing + thin wrapper.
//
// Browser extensions like Alby and nos2x expose `window.nostr` per NIP-07.
// We type it strictly here so callers in apps/web don't have to deal with
// `any` casts at every site.

export interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

export interface SignedEvent extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export interface Nip07Signer {
  /** Returns the user's pubkey (hex). */
  getPublicKey(): Promise<string>;
  /** Signs the unsigned event; returns a fully-signed event. */
  signEvent(event: UnsignedEvent): Promise<SignedEvent>;
  /** Optional NIP-04 / NIP-44 capabilities — not used at MVP. */
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  /** Returns the relays the signer recommends, if any. */
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
}

declare global {
  interface Window {
    nostr?: Nip07Signer;
  }
}

export type Nip07Status =
  | { kind: "AVAILABLE"; signer: Nip07Signer }
  | { kind: "MISSING" };

/**
 * Detects a NIP-07 signer in the current `window`. Safe to call from a
 * server component — returns MISSING server-side without throwing.
 */
export function detectNip07(): Nip07Status {
  if (typeof window === "undefined") return { kind: "MISSING" };
  const signer = (window as Window).nostr;
  if (!signer) return { kind: "MISSING" };
  return { kind: "AVAILABLE", signer };
}
