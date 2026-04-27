// PPLNS window builder.
//
// Pulls the last N shares for a group from the DB, groups by member,
// sums their share difficulties as `shareWeight`, and returns the data
// shape that @hashden/coinbase's buildPplnsCoinbase expects.
//
// "PPLNS" = Pay Per Last N Shares. The window slides as new shares come
// in; the stratum re-runs this on each template-rebuild tick (target
// every ~2s) so the coinbase outputs reflect the current weights.

import type { PplnsMember } from "@hashden/shared";
import type { PrismaLike } from "./group-router.js";

// Re-export so callers don't need to dig into @hashden/shared themselves.
export type { PplnsMember } from "@hashden/shared";

export interface PplnsWindowOpts {
  groupId: string;
  /** How many recent shares to include in the window. */
  windowSize: number;
}

/** Extends PrismaLike with the methods this builder needs. */
export interface PplnsPrismaLike extends PrismaLike {
  share: {
    findMany(args: {
      where: { groupId: string };
      orderBy: { ts: "desc" };
      take: number;
      select: { memberPubkey: true; difficulty: true };
    }): Promise<Array<{ memberPubkey: string; difficulty: number }>>;
  };
  member: PrismaLike["member"] & {
    findMany(args: {
      where: {
        groupId: string;
        memberPubkey: { in: string[] };
      };
      select: { memberPubkey: true; btcAddress: true };
    }): Promise<Array<{ memberPubkey: string; btcAddress: string }>>;
  };
}

export async function computePplnsWindow(
  prisma: PplnsPrismaLike,
  opts: PplnsWindowOpts,
): Promise<PplnsMember[]> {
  if (opts.windowSize <= 0 || !Number.isInteger(opts.windowSize)) {
    throw new Error("windowSize must be a positive integer");
  }
  if (!opts.groupId) throw new Error("groupId required");

  const shares = await prisma.share.findMany({
    where: { groupId: opts.groupId },
    orderBy: { ts: "desc" },
    take: opts.windowSize,
    select: { memberPubkey: true, difficulty: true },
  });

  if (shares.length === 0) return [];

  // Sum difficulties per member. Difficulty is float; we scale by 1e6 to
  // preserve precision and convert to bigint share weight. The absolute
  // unit doesn't matter for PPLNS — only the ratio between members does.
  const weightsByPubkey = new Map<string, bigint>();
  for (const s of shares) {
    const scaled = BigInt(Math.round(s.difficulty * 1_000_000));
    if (scaled <= 0n) continue;
    weightsByPubkey.set(
      s.memberPubkey,
      (weightsByPubkey.get(s.memberPubkey) ?? 0n) + scaled,
    );
  }

  const pubkeys = [...weightsByPubkey.keys()];
  if (pubkeys.length === 0) return [];

  const members = await prisma.member.findMany({
    where: { groupId: opts.groupId, memberPubkey: { in: pubkeys } },
    select: { memberPubkey: true, btcAddress: true },
  });
  const addrByPubkey = new Map<string, string>(
    members.map((m) => [m.memberPubkey, m.btcAddress]),
  );

  // Build result: drop members whose address we couldn't resolve (member
  // was deleted while their shares were still in the window). Their
  // weight implicitly redistributes to the remaining members on the
  // coinbase builder side. Caller should treat this as a soft warning
  // — we don't throw because the stratum must keep building templates.
  const result: PplnsMember[] = [];
  for (const [memberPubkey, shareWeight] of weightsByPubkey) {
    const btcAddress = addrByPubkey.get(memberPubkey);
    if (!btcAddress) continue;
    result.push({ memberPubkey, btcAddress, shareWeight });
  }

  // Sort ascending by memberPubkey — buildPplnsCoinbase requires this for
  // determinism (same input always produces the same coinbase bytes).
  result.sort((a, b) => (a.memberPubkey < b.memberPubkey ? -1 : 1));
  return result;
}
