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

// Public origin of the web app, used to build absolute URLs (e.g. the
// BTCPay invoice redirect-back target). Defaults to localhost in dev.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "http://localhost:3000";

// Public flag that gates the in-app /support donation page and the header
// "Support" CTA. Set to "true" only on deployments where the server-side
// BTCPAY_* values are configured (the page double-checks server config and
// shows an "unavailable" state if they're missing). The BTCPay URL, store id,
// and API key are server-only (read in lib/btcpay.ts) and never exposed here.
//
// Donations are a voluntary project tip settled by BTCPay — entirely separate
// from the non-custodial member payout flow.
export const DONATIONS_ENABLED =
  process.env.NEXT_PUBLIC_DONATIONS_ENABLED === "true";

// Recipient npub for Nostr zap donations (NIP-57). Public — the client decodes
// it to a pubkey and builds the zap request. When set (alongside the server-only
// ZAP_LIGHTNING_ADDRESS, read in lib/zap-server.ts), the /support page offers a
// "Zap" option. Voluntary tip; the donor opts into publicity by signing.
export const ZAP_NPUB = process.env.NEXT_PUBLIC_ZAP_NPUB?.trim() || undefined;
