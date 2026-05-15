// Centralized env-var reads. Server-side usage is fine; for client-side
// use only the NEXT_PUBLIC_* values.

export const HASHDEN_API_URL =
  process.env.NEXT_PUBLIC_HASHDEN_API_URL ?? "http://localhost:3334";

export const HASHDEN_STRATUM_URL =
  process.env.NEXT_PUBLIC_HASHDEN_STRATUM_URL ??
  "stratum+tcp://stratum.hashden.app:3333";

export const HASHDEN_RELAYS = (
  process.env.NEXT_PUBLIC_HASHDEN_RELAYS ??
  "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net"
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
