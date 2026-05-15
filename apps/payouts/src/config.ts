// Environment-driven config for the payouts worker.
//
// Reads at module-load time; throws if required vars are missing so we
// fail fast rather than silently use undefined values.

export interface PayoutsConfig {
  databaseUrl: string;
  bitcoinRpcUrl: string;
  bitcoinRpcUser: string;
  bitcoinRpcPassword: string;
  /** Wall-clock interval for the maturity watcher tick. */
  tickMs: number;
  /** Confirmations required before a block is considered matured. */
  maturityConfs: number;
  /** Project npub (hex) for signing NIP-57 zap receipts. */
  projectNpubHex: string;
  /** Project nsec (hex) for signing. NEVER log this. */
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
    projectNpubHex: required(env, "PROJECT_NPUB_HEX"),
    projectNsecHex: required(env, "PROJECT_NSEC_HEX"),
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
