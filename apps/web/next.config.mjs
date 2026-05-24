/** @type {import('next').NextConfig} */

// Browser-reachable origins, built from the same env vars (and defaults) as
// src/lib/env.ts so the CSP stays correct per environment (the image is built
// per-branch with that environment's NEXT_PUBLIC_* baked in):
//   - the Hashden API (client calls in src/lib/api.ts)
//   - the Nostr relays (SimplePool WebSockets in ZapForm / useNostrProfile)
// Everything else the browser talks to is same-origin: BTCPay and the zap
// flow go through our own /api/* route handlers, not direct from the page.
const apiUrl = process.env.NEXT_PUBLIC_HASHDEN_API_URL ?? "http://localhost:3334";
const relays = (
  process.env.NEXT_PUBLIC_HASHDEN_RELAYS ??
  "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net"
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Nostr profile pictures are arbitrary user-set https URLs; data: covers
  // inline/blurhash placeholders.
  "img-src 'self' data: https:",
  // next/font/google self-hosts the font at build time, so 'self' is enough.
  "font-src 'self'",
  // Next.js injects inline bootstrap/hydration scripts. Enforcing
  // script-src 'self' cleanly needs per-request nonces (a follow-up); that
  // is exactly why this whole policy ships Report-Only first (see headers()).
  "script-src 'self'",
  // Tailwind + Next inject inline <style>; 'unsafe-inline' is required here.
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${["'self'", apiUrl, ...relays].join(" ")}`,
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework/version (pentest L-01).
  poweredByHeader: false,
  // Standalone output bundles every runtime dep into .next/standalone/
  // so the production image needs only Node + that dir (~150 MB total)
  // instead of shipping the whole monorepo (~1.7 GB).
  output: "standalone",
  // Standalone traces files starting from the workspace root, not the
  // app dir, so it picks up workspace-package source it needs.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  // Allow importing from sibling workspace packages (TS source).
  transpilePackages: ["@hashden/db", "@hashden/nostr", "@hashden/shared"],
  typedRoutes: true,
  // Security headers (pentest MED-02). The flat headers below are safe to
  // enforce; the CSP ships Content-Security-Policy-Report-Only so a missed
  // source can't white-screen the app — promote it to the enforcing
  // Content-Security-Policy header once the browser reports come back clean.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  // Workspace packages use NodeNext-style `.js` import extensions
  // (required for Node ESM); webpack needs this alias to map them back
  // to `.ts` source when bundling them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
