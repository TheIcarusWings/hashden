// IN_FLIGHT crash recovery.
//
// When the worker crashes between calling LNbits payInvoice() and
// updating the PayoutAttempt row to PAID/FAILED, the row is left
// IN_FLIGHT. On startup we ask LNbits the actual payment status by hash
// and finalize the attempt:
//
//   paid=true               → mark PAID (we have the hash already)
//   paid=false, pending=true → leave IN_FLIGHT (HTLC still in flight)
//   paid=false, pending=false → mark FAILED (operator can manually retry)
//
// Without lnPaymentHash we have no way to look it up — those rows
// transition to FAILED defensively (the operator's wallet shows whether
// any sats actually moved).

import type { PrismaClient } from "@hashden/db";
import type { LnClient } from "./ln-client.js";

export interface ReconcileResult {
  scanned: number;
  promotedPaid: number;
  markedFailed: number;
  stillInFlight: number;
  unrecoverable: number;
}

export async function reconcileInFlight(args: {
  prisma: PrismaClient;
  buildLnClient: (groupId: string) => Promise<LnClient | null>;
}): Promise<ReconcileResult> {
  const { prisma, buildLnClient } = args;
  const rows = await prisma.payoutAttempt.findMany({
    where: { status: "IN_FLIGHT", kind: "LN_DUST" },
    select: {
      id: true,
      blockId: true,
      memberPubkey: true,
      lnPaymentHash: true,
      block: { select: { groupId: true } },
    },
  });
  const result: ReconcileResult = {
    scanned: rows.length,
    promotedPaid: 0,
    markedFailed: 0,
    stillInFlight: 0,
    unrecoverable: 0,
  };

  for (const row of rows) {
    if (!row.lnPaymentHash) {
      // No hash → can't reconcile. Mark FAILED so the operator can act.
      await prisma.payoutAttempt.update({
        where: { id: row.id },
        data: { status: "FAILED" },
      });
      result.markedFailed++;
      result.unrecoverable++;
      continue;
    }

    const client = await buildLnClient(row.block.groupId);
    if (!client) {
      // Operator removed credentials between flight and recovery.
      // Conservative: leave as IN_FLIGHT — operator can resubmit creds
      // and the next reconcile pass will pick it up.
      result.stillInFlight++;
      continue;
    }

    try {
      const status = await client.getPaymentStatus(row.lnPaymentHash);
      if (status.paid) {
        await prisma.payoutAttempt.update({
          where: { id: row.id },
          data: { status: "PAID" },
        });
        result.promotedPaid++;
      } else if (status.pending) {
        // HTLC in flight; leave IN_FLIGHT for the next reconcile pass.
        result.stillInFlight++;
      } else {
        await prisma.payoutAttempt.update({
          where: { id: row.id },
          data: { status: "FAILED" },
        });
        result.markedFailed++;
      }
    } catch (err) {
      console.warn(
        `[payouts] reconcile getPaymentStatus failed for attempt ${row.id}: ${(err as Error).message}`,
      );
      // Leave IN_FLIGHT; next pass will retry.
      result.stillInFlight++;
    }
  }

  return result;
}
