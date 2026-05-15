// Environment-driven config for the payouts worker.
//
// Reads at module-load time; throws if required vars are missing so we
// fail fast rather than silently use undefined values.

import { nip19 } from "nostr-tools";

export interface PayoutsConfig {
  databaseUrl: string;
  bitcoinRpcUrl: string;
  bitcoinRpcUser: string;
  bitcoinRpcPassword: string;
  /** Wall-clock interval for the maturity watcher tick. */
  tickMs: number;
  /** Confirmations required before a block is considered matured. */
  maturityConfs: number;
  /** Hashden signing pubkey as 64-char hex (decoded from bech32 if env supplied npub1...). */
  projectNpubHex: string;
  /** Hashden signing private key as 64-char hex (decoded from bech32 if env supplied nsec1...). NEVER log. */
  projectNsecHex: string;
  /** Comma-separated relay URLs for publishing zap receipts. */
  relays: string[];
  /** Cap on concurrent in-flight Lightning payments to avoid LND wedge. */
  paymentConcurrency: number;
  /** 32-byte hex master key for decrypting Group.operatorLnSecret. */
  operatorCredsEncKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PayoutsConfig {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    bitcoinRpcUrl: required(env, "BITCOIN_RPC_URL"),
    bitcoinRpcUser: required(env, "BITCOIN_RPC_USER"),
    bitcoinRpcPassword: required(env, "BITCOIN_RPC_PASSWORD"),
    tickMs: parseInt(env.PAYOUTS_TICK_MS ?? "30000", 10),
    maturityConfs: parseInt(env.MATURITY_CONFS ?? "100", 10),
    projectNpubHex: parseNostrKey(env, ["PROJECT_NPUB", "PROJECT_NPUB_HEX"], "npub"),
    projectNsecHex: parseNostrKey(env, ["PROJECT_NSEC", "PROJECT_NSEC_HEX"], "nsec"),
    relays: (env.NOSTR_RELAYS ??
      "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
    paymentConcurrency: parseInt(env.PAYMENT_CONCURRENCY ?? "5", 10),
    operatorCredsEncKey: env.OPERATOR_CREDS_ENC_KEY,
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`required env var missing: ${name}`);
  return v;
}

/**
 * Reads a Nostr key env var. Accepts either bech32 (`npub1…` / `nsec1…`) or
 * 64-char hex. Returns hex (the internal canonical form). Tries `names` in
 * order — first non-empty wins — which lets us keep `_HEX`-suffixed legacy
 * names working alongside the cleaner `PROJECT_NPUB` / `PROJECT_NSEC` ones.
 */
function parseNostrKey(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  expectedType: "npub" | "nsec",
): string {
  for (const name of names) {
    const raw = env[name]?.trim();
    if (!raw) continue;

    if (raw.startsWith(`${expectedType}1`)) {
      let decoded;
      try {
        decoded = nip19.decode(raw);
      } catch (e) {
        throw new Error(`${name}: invalid ${expectedType} bech32: ${(e as Error).message}`);
      }
      if (decoded.type !== expectedType) {
        throw new Error(`${name}: expected ${expectedType}, got ${decoded.type}`);
      }
      // npub decodes to a hex string; nsec decodes to a 32-byte Uint8Array.
      return typeof decoded.data === "string"
        ? decoded.data
        : Buffer.from(decoded.data as Uint8Array).toString("hex");
    }

    // Caught a swapped pair — give a clearer error than "doesn't match any format".
    const otherType = expectedType === "npub" ? "nsec" : "npub";
    if (raw.startsWith(`${otherType}1`)) {
      throw new Error(`${name}: expected ${expectedType}, got ${otherType}`);
    }

    if (/^[0-9a-f]{64}$/i.test(raw)) {
      return raw.toLowerCase();
    }

    throw new Error(
      `${name}: must be ${expectedType}1... (bech32) or 64-char hex`,
    );
  }
  throw new Error(`required env var missing: one of ${names.join(", ")}`);
}
