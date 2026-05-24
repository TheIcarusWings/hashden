#!/usr/bin/env node
// hashden-verify — run between your miner and a Hashden den to confirm, before
// hashing, that every job actually pays YOUR address. Trusts the server for
// nothing about getting paid.

import { parseArgs } from "./config.js";
import { addressToScript } from "./verify.js";
import { startProxy } from "./proxy.js";

const USAGE = `
hashden-verify — confirm every mining job pays your address

Usage:
  hashden-verify --den <host:port> --address <btc-address> [options]

Required:
  --den <host:port>        the den's stratum (e.g. stratum.hashden.app:3333)
  --address <btc-address>  your payout address (you registered it; it stays local)

Options:
  --listen <host:port>     where your miner connects   (default 127.0.0.1:3333)
  --rule <solo|pplns>      payout rule of the den       (default solo)
  --min-share <0..1>       SOLO: min fraction of reward your address must get (default 0.9)
  --min-sats <n>           PPLNS: min sats your address must get (default 1 = present)
  --network <net>          mainnet | testnet | regtest  (default mainnet)
  --strict                 exit on the first failing job (stop the rig)

Then point your miner at the --listen address instead of the den.
Env equivalents: VERIFY_DEN, VERIFY_ADDRESS, VERIFY_LISTEN, VERIFY_RULE,
VERIFY_MIN_SHARE, VERIFY_MIN_SATS, VERIFY_NETWORK, VERIFY_STRICT.
`;

function main(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  let cfg;
  try {
    cfg = parseArgs(process.argv.slice(2));
    addressToScript(cfg.myAddress, cfg.network); // fail fast on a bad address
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n${USAGE}`);
    process.exit(1);
  }

  console.log(`hashden-verify — every job must pay ${cfg.myAddress}`);
  console.log(
    `  rule=${cfg.payoutRule} network=${cfg.network}` +
      (cfg.payoutRule === "SOLO_SHOWCASE"
        ? ` min-share=${cfg.minRewardShare}`
        : cfg.minSats !== undefined
          ? ` min-sats=${cfg.minSats}`
          : ""),
  );
  console.log(
    `  point your miner at ${cfg.listenHost}:${cfg.listenPort}` +
      (cfg.strict ? "  (strict: will stop on a bad job)" : "") +
      "\n",
  );
  startProxy(cfg);
}

main();
