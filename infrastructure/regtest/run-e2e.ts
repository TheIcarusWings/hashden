// Hashden regtest E2E driver.
//
// Drives the maturity → recordOnChainPayouts flow against a local
// bitcoind regtest. Does NOT exercise stratum coinbase construction
// (that's covered by 200 fuzz cases in @hashden/coinbase) — focuses
// on what's hardest to unit-test: the worker pipeline against a real
// JSON-RPC + a real on-chain block.
//
// Prereqs:
//   1. docker compose -f infrastructure/docker-compose.yml up -d
//      (postgres + redis on the dev ports)
//   2. docker compose -f infrastructure/regtest/docker-compose.yml up -d
//      (bitcoind regtest)
//   3. DATABASE_URL points at the dev postgres + Prisma migration applied:
//      pnpm --filter @hashden/db db:migrate:deploy
//
// Run:
//   pnpm tsx infrastructure/regtest/run-e2e.ts
//
// Cleanup between runs:
//   pnpm --filter @hashden/db prisma migrate reset --force --skip-seed

import { prisma } from "@hashden/db";
import { BitcoinRpcClient } from "@hashden/templates";
import { checkMaturity } from "../../apps/payouts/src/maturity-watcher.js";
import { recordOnChainPayouts } from "../../apps/payouts/src/dust-fanout.js";

const RPC_URL = process.env.BITCOIN_RPC_URL ?? "http://127.0.0.1:18443";
const RPC_USER = process.env.BITCOIN_RPC_USER ?? "regtest";
const RPC_PASSWORD = process.env.BITCOIN_RPC_PASSWORD ?? "regtest";

const TEST_GROUP_SLUG = "regtest-solo";
const TEST_OPERATOR_PUBKEY = "f".repeat(64);
const TEST_MEMBER_PUBKEY = "a".repeat(64);

async function rpc(rpcClient: BitcoinRpcClient, method: string, params: unknown[] = []) {
  return rpcClient.call(method, params);
}

async function main() {
  const rpcClient = new BitcoinRpcClient({
    url: RPC_URL,
    auth: `${RPC_USER}:${RPC_PASSWORD}`,
  });

  console.log("[regtest] checking RPC connectivity…");
  const info = await rpc<{ chain: string; blocks: number }>(rpcClient, "getblockchaininfo");
  if (info.chain !== "regtest") {
    throw new Error(`expected regtest chain, got ${info.chain}`);
  }
  console.log(`[regtest] connected; chain=${info.chain} blocks=${info.blocks}`);

  console.log("[regtest] ensuring wallet…");
  try {
    await rpc(rpcClient, "createwallet", ["e2e"]);
  } catch (e) {
    // BitcoinRpcClient throws BitcoinRpcError({kind:'HTTP',status:500}) for
    // any non-2xx including the "wallet already exists" case. Re-load if so.
    try {
      await rpc(rpcClient, "loadwallet", ["e2e"]);
    } catch (e2) {
      if (!String(e2).includes("already loaded") && !String(e2).includes("HTTP 500")) throw e2;
    }
  }
  // From this point on, RPC URL must include the wallet name in path.
  const walletRpc = new BitcoinRpcClient({
    url: `${RPC_URL}/wallet/e2e`,
    auth: `${RPC_USER}:${RPC_PASSWORD}`,
  });
  const winnerAddress = await rpc<string>(walletRpc, "getnewaddress", ["", "bech32"]);
  console.log(`[regtest] winner address: ${winnerAddress}`);

  console.log("[regtest] mining 101 blocks to winner…");
  const blockHashes = await rpc<string[]>(walletRpc, "generatetoaddress", [101, winnerAddress]);
  const firstHash = blockHashes[0];
  const firstHeight = info.blocks + 1;
  const block = await rpc<{ tx: string[]; height: number; confirmations: number }>(
    walletRpc,
    "getblock",
    [firstHash, 1],
  );
  console.log(`[regtest] first block: hash=${firstHash} height=${block.height} confs=${block.confirmations}`);
  if (block.confirmations < 100) {
    throw new Error(`expected ≥100 confs, got ${block.confirmations}`);
  }

  console.log("[regtest] resetting test rows…");
  // Look up the test group by slug; delete all FK-dependent rows first.
  // Previous runs may have left blocks with a different hash, so we scope
  // the block delete to the group's id, not just this run's hash.
  const existing = await prisma.group.findUnique({
    where: { slug: TEST_GROUP_SLUG },
    select: { id: true },
  });
  if (existing) {
    await prisma.payoutAttempt.deleteMany({ where: { block: { groupId: existing.id } } });
    await prisma.block.deleteMany({ where: { groupId: existing.id } });
    await prisma.member.deleteMany({ where: { groupId: existing.id } });
    await prisma.group.delete({ where: { id: existing.id } });
  }

  console.log("[regtest] seeding group + member + FOUND block…");
  const group = await prisma.group.create({
    data: {
      slug: TEST_GROUP_SLUG,
      operatorPubkey: TEST_OPERATOR_PUBKEY,
      operatorBtcAddress: winnerAddress,
      feeBps: 0,
      payoutRule: "SOLO_SHOWCASE",
      templateSource: "PLATFORM_DEFAULT",
    },
  });
  await prisma.member.create({
    data: {
      groupId: group.id,
      memberPubkey: TEST_MEMBER_PUBKEY,
      btcAddress: winnerAddress,
      lightningAddress: "test@example.com",
    },
  });
  const REWARD_SATS = 50n * 100_000_000n;  // regtest subsidy at height 1
  const dbBlock = await prisma.block.create({
    data: {
      groupId: group.id,
      height: firstHeight,
      hash: firstHash,
      rewardSats: REWARD_SATS,
      status: "FOUND",
      coinbaseOutputs: [
        {
          address: winnerAddress,
          sats: Number(REWARD_SATS),
          memberPubkey: TEST_MEMBER_PUBKEY,
          kind: "MEMBER",
        },
      ],
    },
  });
  console.log(`[regtest] inserted block ${dbBlock.id}`);

  console.log("[regtest] running checkMaturity…");
  const maturity = await checkMaturity({ prisma, rpc: rpcClient, maturityConfs: 100 });
  console.log(`[regtest] matured=${maturity.matured.length} orphaned=${maturity.orphaned.length} errored=${maturity.errored.length}`);
  if (!maturity.matured.includes(dbBlock.id)) {
    throw new Error(`expected block ${dbBlock.id} to mature; got matured=${JSON.stringify(maturity.matured)}, errored=${JSON.stringify(maturity.errored)}`);
  }

  console.log("[regtest] running recordOnChainPayouts…");
  const recorded = await recordOnChainPayouts(prisma, dbBlock.id);
  console.log(`[regtest] recorded=${recorded.recorded} pending=${recorded.pending} zaps=${recorded.zapsPublished}`);
  if (recorded.recorded !== 1) {
    throw new Error(`expected 1 ON_CHAIN_COINBASE row, got ${recorded.recorded}`);
  }

  const attempts = await prisma.payoutAttempt.findMany({ where: { blockId: dbBlock.id } });
  const onChain = attempts.find((a) => a.kind === "ON_CHAIN_COINBASE");
  if (!onChain) throw new Error("no ON_CHAIN_COINBASE row found");
  if (onChain.status !== "PAID") throw new Error(`expected PAID, got ${onChain.status}`);
  if (onChain.amountSats !== REWARD_SATS) {
    throw new Error(`expected ${REWARD_SATS}, got ${onChain.amountSats}`);
  }
  console.log(`[regtest] ✅ ON_CHAIN_COINBASE row PAID with ${onChain.amountSats} sats to ${TEST_MEMBER_PUBKEY.slice(0, 8)}…`);

  console.log("[regtest] DONE — basic maturity + record-on-chain pipeline green.");
  console.log("[regtest] gaps: dust-fanout (needs LNbits fakewallet); reconcileInFlight (needs SIGKILL mid-run).");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[regtest] FAILED:", e);
  process.exit(1);
});
