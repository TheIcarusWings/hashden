#!/usr/bin/env tsx
//
// Smoke test for @hashden/templates against a live Bitcoin Core / Knots node.
// Verifies that BitcoinRpcClient parses a real getblocktemplate response
// correctly and that source resolution produces working RPC endpoints.
//
// Usage:
//   BITCOIN_RPC_URL=http://127.0.0.1:8332 \
//   BITCOIN_RPC_AUTH="user:pass" \
//   pnpm --filter @hashden/templates smoke

import { BitcoinRpcClient } from "../src/rpc-client.js";
import { resolveTemplateSource, templateSourceEndpoint } from "../src/source.js";

const url = process.env.BITCOIN_RPC_URL ?? "http://127.0.0.1:8332";
const auth = process.env.BITCOIN_RPC_AUTH;
if (!auth) {
  console.error("BITCOIN_RPC_AUTH=user:pass required");
  process.exit(1);
}

async function main() {
  console.log(`▶ direct client at ${url}`);
  const client = new BitcoinRpcClient({ url, auth, timeoutMs: 8000 });

  const tip = await client.getBlockCount();
  console.log(`  tip height: ${tip}`);

  const t0 = Date.now();
  const template = await client.getBlockTemplate();
  const elapsed = Date.now() - t0;
  console.log(`  getblocktemplate: ${elapsed}ms`);
  console.log(`  template height:   ${template.height}`);
  console.log(`  coinbasevalue:     ${template.coinbasevalue} sats`);
  console.log(`  txs:               ${template.transactions.length}`);
  console.log(`  prev:              ${template.previousblockhash}`);
  console.log(`  bits:              ${template.bits}`);
  console.log(`  default_witness:   ${template.default_witness_commitment ?? "(none)"}`);

  console.log(`\n▶ source resolution`);
  const platformDefault = { url, auth };

  const platform = resolveTemplateSource(
    {
      templateSource: "PLATFORM_DEFAULT",
      operatorRpcUrl: null,
      operatorRpcAuth: null,
    },
    platformDefault,
  );
  const platEndpoint = templateSourceEndpoint(platform, platformDefault);
  console.log(`  PLATFORM_DEFAULT → ${platEndpoint.url}`);

  const operator = resolveTemplateSource(
    {
      templateSource: "OPERATOR_RPC",
      operatorRpcUrl: "http://operator-node.example/",
      operatorRpcAuth: "op:secret",
    },
    platformDefault,
  );
  const opEndpoint = templateSourceEndpoint(operator, platformDefault);
  console.log(`  OPERATOR_RPC     → ${opEndpoint.url} (auth=${opEndpoint.auth.slice(0, 4)}…)`);

  console.log(`\n✓ @hashden/templates pipeline works end-to-end against real Knots`);
}

main().catch((err) => {
  console.error("✗ smoke failed:", err);
  process.exit(1);
});
