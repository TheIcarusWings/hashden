// Per-pubkey mining stats across every den the pubkey contributes to.
//
// GET /hashden/members/:pubkey/stats?windowMinutes=1440
//
// Returns the same kind of aggregate as the per-den hashrate endpoint,
// but rolled up across all of a member's dens — so /me can show a
// single headline "your hashrate" number and a per-den breakdown.
//
// No special auth: anyone can query "what are this pubkey's mining
// stats?" Same logic as /groups/by/:pubkey — Nostr identities are
// public and the answer doesn't reveal anything not already on chain
// (once a block is mined) or in the public shares list. The endpoint
// only ever returns aggregated numbers, never raw share rows.

import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { prisma } from '@hashden/db';

const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 30 * 24 * 60; // 30 days
const DEFAULT_WINDOW_MINUTES = 24 * 60;

const CURRENT_WINDOW_MINUTES = 10;

const SHARE_HASHES = 2n ** 32n;

@Controller('hashden/members/:pubkey')
export class HashdenMembersStatsController {
  @Get('stats')
  async stats(
    @Param('pubkey') pubkey: string,
    @Query('windowMinutes') windowRaw?: string,
  ): Promise<{
    pubkey: string;
    windowMinutes: number;
    currentWindowMinutes: number;
    currentHashrateHs: string;
    currentShareCount: number;
    perDen: {
      slug: string;
      hashrateHs: string;
      shareCount: number;
    }[];
  }> {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new HttpException(
        'pubkey must be 64 hex chars',
        HttpStatus.BAD_REQUEST,
      );
    }
    const windowMinutes = clampInt(windowRaw, {
      min: MIN_WINDOW_MINUTES,
      max: MAX_WINDOW_MINUTES,
      fallback: DEFAULT_WINDOW_MINUTES,
    });
    const windowStart = new Date(Date.now() - windowMinutes * 60_000);

    // Group shares by den over the window — wide enough to show
    // "you've been mining here for a while" without being misleading
    // if a Bitaxe has been off for hours. Joined with Group only to
    // expose the slug; we never return raw share rows.
    const rows = await prisma.$queryRaw<
      { slug: string; work: number; share_count: bigint }[]
    >`
      SELECT
        g."slug" AS slug,
        SUM(s."difficulty")::float8 AS work,
        COUNT(*)::bigint AS share_count
      FROM "Share" s
      JOIN "Group" g ON g."id" = s."groupId"
      WHERE s."memberPubkey" = ${pubkey}
        AND s."ts" >= ${windowStart}
      GROUP BY g."slug"
      ORDER BY work DESC
    `;
    const windowSeconds = BigInt(windowMinutes * 60);
    const perDen = rows.map((r) => {
      const work = BigInt(Math.round(r.work ?? 0));
      const hashrateHs = work > 0n ? (work * SHARE_HASHES) / windowSeconds : 0n;
      return {
        slug: r.slug,
        hashrateHs: hashrateHs.toString(),
        shareCount: Number(r.share_count),
      };
    });

    // Rolling "right now" sum across every den; lets /me show one
    // big number that reacts quickly to a Bitaxe joining/dropping.
    const currentSince = new Date(Date.now() - CURRENT_WINDOW_MINUTES * 60_000);
    const current = await prisma.share.aggregate({
      where: { memberPubkey: pubkey, ts: { gte: currentSince } },
      _sum: { difficulty: true },
      _count: { _all: true },
    });
    const currentWork = current._sum.difficulty ?? 0;
    const currentHashrateHs =
      currentWork > 0
        ? (BigInt(Math.round(currentWork)) * SHARE_HASHES) /
          BigInt(CURRENT_WINDOW_MINUTES * 60)
        : 0n;

    return {
      pubkey,
      windowMinutes,
      currentWindowMinutes: CURRENT_WINDOW_MINUTES,
      currentHashrateHs: currentHashrateHs.toString(),
      currentShareCount: current._count._all,
      perDen,
    };
  }
}

function clampInt(
  raw: string | undefined,
  opts: { min: number; max: number; fallback: number },
): number {
  if (raw == null) return opts.fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.max(opts.min, Math.min(opts.max, n));
}
