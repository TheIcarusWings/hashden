#!/usr/bin/env tsx
//
// End-to-end demo: pull a real `getblocktemplate` from Bitcoin Core / Knots
// and run it through the full Hashden coinbase pipeline.
//
// Usage:
//   BITCOIN_RPC_URL=http://127.0.0.1:8332 \
//   BITCOIN_RPC_AUTH="user:pass" \
//   pnpm --filter @hashden/coinbase demo
//
// For cookie-auth setups (Core's default), read .cookie from the node's
// data dir and pass it as `__cookie__:<hex>`.
//
// Demonstrates:
//   1. Live RPC reach to the node
//   2. PPLNS coinbase split with synthetic 4-member group
//   3. Address → scriptPubKey encoding for all member outputs
//   4. Sat conservation (sum of outputs == coinbasevalue)

import {
  buildPplnsCoinbase,
  buildSoloShowcaseCoinbase,
  encodeOutputs,
  type PplnsMember,
} from "../src/index.js";

const RPC_URL = process.env.BITCOIN_RPC_URL ?? "http://127.0.0.1:8332";
const RPC_AUTH = process.env.BITCOIN_RPC_AUTH;

if (!RPC_AUTH) {
  console.error("BITCOIN_RPC_AUTH=user:pass required");
  process.exit(1);
}

interface BlockTemplate {
  height: number;
  coinbasevalue: number;
  bits: string;
  previousblockhash: string;
  transactions: unknown[];
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      authorization: `Basic ${Buffer.from(RPC_AUTH!).toString("base64")}`,
    },
    body: JSON.stringify({ jsonrpc: "1.0", id: "demo", method, params }),
  });
  const json = (await res.json()) as { result: T; error: unknown };
  if (json.error) throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

const PLATFORM_BTC = "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h"; // bitcoincore.org example
const OPERATOR_BTC = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

const SYNTHETIC_MEMBERS: PplnsMember[] = [
  { memberPubkey: "01" + "0".repeat(62), btcAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", shareWeight: 100n },
  { memberPubkey: "02" + "0".repeat(62), btcAddress: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", shareWeight: 50n },
  { memberPubkey: "03" + "0".repeat(62), btcAddress: "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", shareWeight: 30n },
  { memberPubkey: "04" + "0".repeat(62), btcAddress: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr", shareWeight: 1n },
];

async function main() {
  console.log(`▶ rpc → ${RPC_URL}`);

  const tipHeight = await rpc<number>("getblockcount");
  console.log(`  current tip height: ${tipHeight}`);

  console.log(`\n▶ getblocktemplate (rules=segwit)`);
  const template = await rpc<BlockTemplate>("getblocktemplate", [{ rules: ["segwit"] }]);
  console.log(`  template height: ${template.height}`);
  console.log(`  coinbasevalue:   ${template.coinbasevalue} sats (${(template.coinbasevalue / 1e8).toFixed(8)} BTC)`);
  console.log(`  prev hash:       ${template.previousblockhash}`);
  console.log(`  txs in template: ${template.transactions.length}`);

  const blockReward = BigInt(template.coinbasevalue);
  const operatorFeeBps = 200; // 2%
  const platformFeeBps = 50;  // 0.5%
  const dustThresholdSats = 10_000n;

  console.log(`\n▶ build PPLNS coinbase for synthetic group (4 members)`);
  console.log(`  share weights: ${SYNTHETIC_MEMBERS.map(m => m.shareWeight).join(", ")}`);
  console.log(`  fees: operator ${operatorFeeBps}bps + platform ${platformFeeBps}bps`);
  console.log(`  dust threshold: ${dustThresholdSats} sats`);

  const result = buildPplnsCoinbase({
    blockRewardSats: blockReward,
    members: SYNTHETIC_MEMBERS,
    operatorBtcAddress: OPERATOR_BTC,
    platformBtcAddress: PLATFORM_BTC,
    operatorFeeBps,
    platformFeeBps,
    dustThresholdSats,
  });

  const sum = result.outputs.reduce((acc, o) => acc + BigInt(o.sats), 0n);
  console.log(`\n▶ outputs (${result.outputs.length}):`);
  for (const o of result.outputs) {
    const pct = (Number(o.sats) / Number(blockReward) * 100).toFixed(4);
    console.log(`  [${o.kind.padEnd(13)}] ${o.sats.padStart(11)} sats (${pct.padStart(7)}%)  ${o.address}`);
  }
  console.log(`\n  sum:    ${sum.toString().padStart(11)} sats`);
  console.log(`  reward: ${blockReward.toString().padStart(11)} sats`);
  console.log(`  match:  ${sum === blockReward ? "✓ conservation holds" : "✗ MISMATCH (bug!)"}`);

  if (result.dustBreakdown.length > 0) {
    console.log(`\n▶ dust breakdown (${result.dustBreakdown.length} members owed via Lightning):`);
    for (const e of result.dustBreakdown) {
      console.log(`  ${e.memberPubkey.slice(0, 10)}...  ${e.owedSats} sats`);
    }
  }

  console.log(`\n▶ encode outputs to scriptPubKeys`);
  const encoded = encodeOutputs(result.outputs);
  for (const o of encoded) {
    const head = Buffer.from(o.scriptPubKey).toString("hex").slice(0, 16);
    console.log(`  [${o.kind.padEnd(13)}] script (${o.scriptPubKey.length}B): ${head}...  → ${o.valueSats} sats`);
  }

  console.log(`\n✓ pipeline OK — ready for stratum's MiningJob to merge into block template`);
}

main().catch((err) => {
  console.error("✗ demo failed:", err);
  process.exit(1);
});
