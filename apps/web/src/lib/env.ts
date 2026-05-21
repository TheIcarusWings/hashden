// Centralized env-var reads. Server-side usage is fine; for client-side
// use only the NEXT_PUBLIC_* values.

export const HASHDEN_API_URL =
  process.env.NEXT_PUBLIC_HASHDEN_API_URL ?? "http://localhost:3334";

// Server-only API URL used by Next's server-rendered pages. Defaults to
// the public URL so existing setups keep working, but in compose deploys
// we point this at the internal `stratum` service hostname. That bypasses
// public DNS + Traefik entirely — important on dev where the Tailscale
// gate would otherwise 403 traffic from the web container (which isn't
// on the tailnet) reaching it via the public hostname.
export const HASHDEN_API_URL_SERVER =
  process.env.HASHDEN_API_URL_INTERNAL ?? HASHDEN_API_URL;

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

// Optional: URL of the project's BTCPay hosted donation/POS page. When set,
// the header shows a "Support" CTA that opens it in a new tab. It's just a
// public link — no API key, no invoice creation here — so donations happen
// entirely on BTCPay and never touch the platform's non-custodial flow.
// Unset (the default) hides the CTA entirely.
export const HASHDEN_DONATE_URL =
  process.env.NEXT_PUBLIC_HASHDEN_DONATE_URL?.trim() || undefined;
