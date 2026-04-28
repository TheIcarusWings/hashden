// Hashden payouts worker — entrypoint.
//
// Tick loop:
//   1. checkMaturity(): promote FOUND blocks → MATURED at ≥100 confs.
//   2. For each newly-matured block: recordOnChainPayouts() writes the
//      ON_CHAIN_COINBASE PayoutAttempts (status=PAID).
//   3. fanoutDust() pays each LN_DUST member via the operator's wallet,
//      bounded by paymentConcurrency.
//
// All persistence is via @hashden/db (Prisma). All RPC via
// @hashden/templates' BitcoinRpcClient (already used in apps/stratum).
// LNbits client is local (apps/payouts/src/lnbits-client.ts) since it's
// only used here at MVP.

import { prisma } from "@hashden/db";
import { BitcoinRpcClient } from "@hashden/templates";
import {
  decryptOperatorCred,
  isEncryptedWire,
  parseMasterKey,
} from "@hashden/crypto";
import { loadConfig } from "./config.js";
import { checkMaturity } from "./maturity-watcher.js";
import { recordOnChainPayouts, fanoutDust } from "./dust-fanout.js";
import { LnbitsClient } from "./lnbits-client.js";

async function main() {
  const config = loadConfig();
  const rpc = new BitcoinRpcClient({
    url: config.bitcoinRpcUrl,
    auth: `${config.bitcoinRpcUser}:${config.bitcoinRpcPassword}`,
  });

  // Master key for decrypting Group.operatorLnSecret at use time. If
  // unset, we skip the decrypt step and treat operatorLnSecret as
  // plaintext (legacy path; logs a warning so this is loud in prod).
  const masterKey = config.operatorCredsEncKey
    ? parseMasterKey(config.operatorCredsEncKey)
    : null;
  if (!masterKey) {
    console.warn(
      "[payouts] OPERATOR_CREDS_ENC_KEY not set — assuming plaintext operatorLnSecret. Set this env var for production.",
    );
  }

  const buildLnbitsClient = async (groupId: string) => {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { operatorLnType: true, operatorLnSecret: true },
    });
    if (!group || group.operatorLnType !== "LNBITS" || !group.operatorLnSecret) {
      return null;
    }
    // Decrypt if encrypted; pass through if legacy plaintext.
    let secret = group.operatorLnSecret;
    if (isEncryptedWire(secret)) {
      if (!masterKey) {
        console.error(
          `[payouts] group ${groupId}: operatorLnSecret is encrypted but no master key configured`,
        );
        return null;
      }
      try {
        secret = decryptOperatorCred(secret, masterKey);
      } catch (e) {
        console.error(
          `[payouts] group ${groupId}: decrypt failed: ${(e as Error).message}`,
        );
        return null;
      }
    }
    const [apiUrl, adminKey] = secret.split("|");
    if (!apiUrl || !adminKey) return null;
    return new LnbitsClient({ apiUrl, adminKey });
  };

  console.log(
    `[payouts] starting; tick=${config.tickMs}ms maturity=${config.maturityConfs}confs`,
  );

  let stopping = false;
  process.on("SIGINT", () => {
    console.log("[payouts] SIGINT; stopping after current tick");
    stopping = true;
  });
  process.on("SIGTERM", () => {
    console.log("[payouts] SIGTERM; stopping after current tick");
    stopping = true;
  });

  while (!stopping) {
    try {
      const m = await checkMaturity({
        prisma,
        rpc,
        maturityConfs: config.maturityConfs,
      });
      if (m.matured.length > 0 || m.orphaned.length > 0 || m.errored.length > 0) {
        console.log(
          `[payouts] maturity tick: matured=${m.matured.length} orphaned=${m.orphaned.length} errored=${m.errored.length}`,
        );
      }

      // For each newly-matured block, record on-chain payouts then fan
      // out dust. We do these inline in the same tick since both are
      // idempotent and fan-out per-block typically completes in a few
      // seconds.
      for (const blockId of m.matured) {
        const onchain = await recordOnChainPayouts(prisma, blockId);
        const fanout = await fanoutDust(blockId, {
          prisma,
          buildLnbitsClient,
          paymentConcurrency: config.paymentConcurrency,
        });
        console.log(
          `[payouts] block ${blockId}: on-chain=${onchain.recorded} dust paid=${fanout.paid} failed=${fanout.failed}`,
        );
        if (fanout.errors.length > 0) {
          for (const e of fanout.errors) {
            console.warn(`[payouts]   ${e.memberPubkey}: ${e.reason}`);
          }
        }
      }
    } catch (err) {
      console.error("[payouts] tick error:", err);
    }

    await sleep(config.tickMs);
  }

  console.log("[payouts] stopped");
  await prisma.$disconnect();
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error("[payouts] fatal:", err);
  process.exit(1);
});
