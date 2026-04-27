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

// We deliberately do NOT `declare global { interface Window }` here
// because that would require the consuming tsconfig to include lib:DOM.
// Workspace consumers like apps/payouts compile with lib:ES2022 only;
// they re-export this module's types but never call detectNip07 at
// runtime. Browser callers reach window.nostr via globalThis at runtime.

export type Nip07Status =
  | { kind: "AVAILABLE"; signer: Nip07Signer }
  | { kind: "MISSING" };

/**
 * Detects a NIP-07 signer in the current global. Safe to call from any
 * environment — returns MISSING server-side / in Node without throwing.
 */
export function detectNip07(): Nip07Status {
  const g = globalThis as { nostr?: Nip07Signer; window?: { nostr?: Nip07Signer } };
  // Browsers expose `window.nostr`; in some contexts the signer attaches
  // directly to globalThis. Check both.
  const signer = g.window?.nostr ?? g.nostr;
  if (!signer) return { kind: "MISSING" };
  return { kind: "AVAILABLE", signer };
}
