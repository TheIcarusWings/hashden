// Dust fan-out for a matured block.
//
// Reads Block.coinbaseOutputs JSON snapshot, extracts the dust-bucket
// breakdown (each member owed sats from the operator's bucket), and
// pays each member via the operator's stored LN credentials. Records
// PayoutAttempt rows with idempotent UNIQUE(blockId, memberPubkey, kind)
// upserts so a worker restart mid-fan-out never double-pays.
//
// Two coinbase-output kinds get PayoutAttempt rows:
//   - ON_CHAIN_COINBASE — the block's coinbase output paid the member
//     directly; no Lightning send. Status PAID immediately at maturity.
//   - LN_DUST — the platform pays the member via Lightning using the
//     operator's wallet credentials. PENDING → IN_FLIGHT → PAID|FAILED.
//
// Concurrency: payment loop respects a configurable cap (default 5) to
// avoid wedging the operator's LND with too many in-flight HTLCs.

import type { PrismaClient } from "@hashden/db";
import type {
  CoinbaseOutput,
  DustBreakdownEntry,
} from "@hashden/shared";
import { LnbitsClient, LnbitsError } from "./lnbits-client.js";

export interface FanoutOpts {
  prisma: PrismaClient;
  /** Resolved at runtime per group via decrypt(operatorLnSecret). */
  buildLnbitsClient: (groupId: string) => Promise<LnbitsClient | null>;
  /** Concurrency cap on in-flight LN payments per group. */
  paymentConcurrency?: number;
}

export interface FanoutResult {
  blockId: string;
  recordedOnChain: number;
  recordedLnPending: number;
  paid: number;
  failed: number;
  errors: { memberPubkey: string; reason: string }[];
}

/**
 * Eagerly write PayoutAttempt rows for every coinbase output of a block.
 * On-chain outputs go in as PAID immediately; dust-bucket members go in
 * as PENDING for the LN fan-out loop to pick up.
 *
 * Idempotent: re-running this on the same block does nothing
 * (UNIQUE(blockId, memberPubkey, kind) prevents duplicates).
 */
export async function recordOnChainPayouts(
  prisma: PrismaClient,
  blockId: string,
): Promise<{ recorded: number; pending: number }> {
  const block = await prisma.block.findUnique({
    where: { id: blockId },
    select: { coinbaseOutputs: true },
  });
  if (!block) throw new Error(`block ${blockId} not found`);
  const outputs = block.coinbaseOutputs as unknown as
    | (CoinbaseOutput & { dustBreakdown?: DustBreakdownEntry[] })[]
    | { outputs: CoinbaseOutput[]; dustBreakdown: DustBreakdownEntry[] };

  // Two persistence shapes are tolerated: either a flat CoinbaseOutput[],
  // or { outputs, dustBreakdown }. Stratum currently writes the flat form.
  const flatOutputs = Array.isArray(outputs) ? outputs : outputs.outputs;
  const dustBreakdown = Array.isArray(outputs)
    ? findDustBreakdown(outputs)
    : outputs.dustBreakdown;

  let recorded = 0;
  let pending = 0;

  for (const o of flatOutputs) {
    if (o.kind !== "MEMBER" || !o.memberPubkey) continue;
    const result = await prisma.payoutAttempt.upsert({
      where: {
        blockId_memberPubkey_kind: {
          blockId,
          memberPubkey: o.memberPubkey,
          kind: "ON_CHAIN_COINBASE",
        },
      },
      create: {
        blockId,
        memberPubkey: o.memberPubkey,
        amountSats: BigInt(o.sats),
        kind: "ON_CHAIN_COINBASE",
        status: "PAID",
      },
      update: {}, // already paid; nothing to update
      select: { id: true },
    });
    if (result) recorded++;
  }

  for (const d of dustBreakdown ?? []) {
    await prisma.payoutAttempt.upsert({
      where: {
        blockId_memberPubkey_kind: {
          blockId,
          memberPubkey: d.memberPubkey,
          kind: "LN_DUST",
        },
      },
      create: {
        blockId,
        memberPubkey: d.memberPubkey,
        amountSats: BigInt(d.owedSats),
        kind: "LN_DUST",
        status: "PENDING",
      },
      update: {},
      select: { id: true },
    });
    pending++;
  }

  return { recorded, pending };
}

/**
 * Run one pass of dust fan-out for a single block. Pays every PENDING
 * LN_DUST PayoutAttempt for the block via the operator's LN wallet.
 *
 * NOT TRANSACTIONAL across attempts — each attempt independently
 * transitions PENDING → IN_FLIGHT → PAID|FAILED so a worker crash leaves
 * the table in a recoverable state. On restart, IN_FLIGHT rows must be
 * reconciled via LnbitsClient.getPaymentStatus before re-attempting.
 */
export async function fanoutDust(
  blockId: string,
  opts: FanoutOpts,
): Promise<FanoutResult> {
  const block = await opts.prisma.block.findUnique({
    where: { id: blockId },
    select: { groupId: true, status: true, hash: true },
  });
  if (!block) throw new Error(`block ${blockId} not found`);
  if (block.status !== "MATURED") {
    throw new Error(`block ${blockId} status is ${block.status}, expected MATURED`);
  }

  const lnbits = await opts.buildLnbitsClient(block.groupId);
  if (!lnbits) {
    // Operator hasn't configured LN credentials. Mark every PENDING
    // dust attempt as FAILED so the operator can see and act on them.
    const updated = await opts.prisma.payoutAttempt.updateMany({
      where: { blockId, kind: "LN_DUST", status: "PENDING" },
      data: { status: "FAILED" },
    });
    return {
      blockId,
      recordedOnChain: 0,
      recordedLnPending: 0,
      paid: 0,
      failed: updated.count,
      errors: [
        { memberPubkey: "*", reason: "operator has no LN credentials configured" },
      ],
    };
  }

  const pending = await opts.prisma.payoutAttempt.findMany({
    where: { blockId, kind: "LN_DUST", status: "PENDING" },
    select: { id: true, memberPubkey: true, amountSats: true },
  });

  const result: FanoutResult = {
    blockId,
    recordedOnChain: 0,
    recordedLnPending: pending.length,
    paid: 0,
    failed: 0,
    errors: [],
  };

  const concurrency = opts.paymentConcurrency ?? 5;
  await runWithConcurrency(pending, concurrency, async (attempt) => {
    // Mark IN_FLIGHT first so a parallel worker (or restart) sees this
    // attempt is being processed and skips it.
    const updated = await opts.prisma.payoutAttempt.updateMany({
      where: { id: attempt.id, status: "PENDING" },
      data: { status: "IN_FLIGHT" },
    });
    if (updated.count === 0) {
      // Another worker grabbed it; skip.
      return;
    }

    // Find the member's lightning address.
    const member = await opts.prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: block.groupId,
          memberPubkey: attempt.memberPubkey,
        },
      },
      select: { lightningAddress: true },
    });
    if (!member) {
      await opts.prisma.payoutAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED" },
      });
      result.failed++;
      result.errors.push({
        memberPubkey: attempt.memberPubkey,
        reason: "member no longer registered in group",
      });
      return;
    }

    try {
      const payment = await lnbits.payLightningAddress(
        member.lightningAddress,
        attempt.amountSats,
      );
      await opts.prisma.payoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "PAID",
          lnPaymentHash: payment.paymentHash,
        },
      });
      result.paid++;
    } catch (err) {
      const reason =
        err instanceof LnbitsError ? `${err.cause.kind}: ${err.message}` : (err as Error).message;
      await opts.prisma.payoutAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED" },
      });
      result.failed++;
      result.errors.push({
        memberPubkey: attempt.memberPubkey,
        reason,
      });
    }
  });

  // If everything succeeded, mark the block DUST_FANNED_OUT for downstream
  // observability. Failures keep the block in MATURED so operators (or a
  // future retry job) can re-attempt.
  if (result.failed === 0) {
    await opts.prisma.block.update({
      where: { id: blockId },
      data: { status: "DUST_FANNED_OUT" },
    });
  }
  return result;
}

function findDustBreakdown(
  outputs: (CoinbaseOutput & { dustBreakdown?: DustBreakdownEntry[] })[],
): DustBreakdownEntry[] | undefined {
  for (const o of outputs) {
    if (o.kind === "DUST_BUCKET" && Array.isArray(o.dustBreakdown)) {
      return o.dustBreakdown;
    }
  }
  return undefined;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const inFlight: Promise<void>[] = [];
  const drain = async () => {
    const next = queue.shift();
    if (next === undefined) return;
    await worker(next);
    await drain();
  };
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    inFlight.push(drain());
  }
  await Promise.all(inFlight);
}
