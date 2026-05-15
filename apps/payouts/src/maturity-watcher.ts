// Maturity watcher.
//
// Tick loop: find Block rows with status=FOUND, check confirmations via
// Bitcoin RPC. If ≥ maturityConfs (default 100), mark them MATURED.
// Reorged blocks (RPC returns "block not in best chain") are marked
// ORPHANED — those will never receive their dust fan-out.

import type { BitcoinRpcClient } from "@hashden/templates";
import type { PrismaClient } from "@hashden/db";

export interface MaturityResult {
  /** Blocks promoted FOUND → MATURED this tick. */
  matured: string[];
  /** Blocks discovered to be orphaned this tick. */
  orphaned: string[];
  /** Block ids that returned RPC errors (e.g. node lagging). */
  errored: { id: string; reason: string }[];
}

export interface MaturityOpts {
  prisma: PrismaClient;
  rpc: BitcoinRpcClient;
  maturityConfs: number;
}

export async function checkMaturity(
  opts: MaturityOpts,
): Promise<MaturityResult> {
  const candidates = await opts.prisma.block.findMany({
    where: { status: "FOUND" },
    select: { id: true, hash: true },
    take: 200,
  });

  const result: MaturityResult = { matured: [], orphaned: [], errored: [] };

  for (const block of candidates) {
    try {
      const info = await opts.rpc.call<{ confirmations: number }>("getblock", [
        block.hash,
        1, // verbosity 1: header + tx ids only
      ]);
      // Negative confirmations indicate the block is no longer on the best
      // chain (Bitcoin Core returns -1 for orphaned blocks).
      if (info.confirmations < 0) {
        await opts.prisma.block.update({
          where: { id: block.id },
          data: { status: "ORPHANED" },
        });
        result.orphaned.push(block.id);
      } else if (info.confirmations >= opts.maturityConfs) {
        await opts.prisma.block.update({
          where: { id: block.id },
          data: { status: "MATURED", maturedAt: new Date() },
        });
        result.matured.push(block.id);
      }
      // else: not yet matured, leave as FOUND for next tick
    } catch (err) {
      const reason = (err as Error).message;
      // RPC method-not-found means the hash isn't known to the node —
      // could be deep reorg or a wrong network. Mark ORPHANED defensively.
      if (/Block not found/i.test(reason)) {
        await opts.prisma.block.update({
          where: { id: block.id },
          data: { status: "ORPHANED" },
        });
        result.orphaned.push(block.id);
      } else {
        result.errored.push({ id: block.id, reason });
      }
    }
  }

  return result;
}
