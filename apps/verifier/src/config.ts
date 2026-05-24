// CLI / env config. Everything the core check needs is local — the den URL,
// your own payout address, and the rule — so no server is trusted.

import type { Network, PayoutRule } from "./verify.js";

export interface VerifierConfig {
  denHost: string;
  denPort: number;
  listenHost: string;
  listenPort: number;
  /** Your payout address — the thing being verified. Also satisfies VerifyConfig. */
  myAddress: string;
  payoutRule: PayoutRule;
  minRewardShare: number;
  minSats?: bigint;
  network: Network;
  /** Exit non-zero on the first failing job (so a wrapper/rig can stop). */
  strict: boolean;
}

function splitHostPort(s: string, defaultPort: number): { host: string; port: number } {
  const i = s.lastIndexOf(":");
  if (i === -1) return { host: s, port: defaultPort };
  const port = Number(s.slice(i + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port in "${s}"`);
  }
  return { host: s.slice(0, i), port };
}

export function parseArgs(argv: string[]): VerifierConfig {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      bools.add(key);
    }
  }
  const get = (k: string, env?: string): string | undefined =>
    flags.get(k) ?? (env ? process.env[env] : undefined);

  const den = get("den", "VERIFY_DEN");
  const address = get("address", "VERIFY_ADDRESS");
  if (!den) throw new Error("--den <host:port> is required (the den's stratum)");
  if (!address) {
    throw new Error("--address <btc-address> is required (your payout address)");
  }

  const ruleRaw = (get("rule", "VERIFY_RULE") ?? "solo").toLowerCase();
  const payoutRule: PayoutRule = ruleRaw.startsWith("pplns")
    ? "PPLNS"
    : "SOLO_SHOWCASE";
  const network = (get("network", "VERIFY_NETWORK") ?? "mainnet").toLowerCase() as Network;

  const denHP = splitHostPort(den, 3333);
  const listenHP = splitHostPort(get("listen", "VERIFY_LISTEN") ?? "127.0.0.1:3333", 3333);

  const minShareRaw = get("min-share", "VERIFY_MIN_SHARE");
  const minRewardShare =
    minShareRaw !== undefined
      ? Number(minShareRaw)
      : payoutRule === "SOLO_SHOWCASE"
        ? 0.9
        : 0;
  if (!(minRewardShare >= 0 && minRewardShare <= 1)) {
    throw new Error("--min-share must be between 0 and 1");
  }

  const minSatsRaw = get("min-sats", "VERIFY_MIN_SATS");

  return {
    denHost: denHP.host,
    denPort: denHP.port,
    listenHost: listenHP.host,
    listenPort: listenHP.port,
    myAddress: address,
    payoutRule,
    minRewardShare,
    minSats: minSatsRaw !== undefined ? BigInt(minSatsRaw) : undefined,
    network,
    strict: bools.has("strict") || process.env.VERIFY_STRICT === "true",
  };
}
