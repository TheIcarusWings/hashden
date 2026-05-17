// Read-only REST endpoint for share-history queries.
// Web app reads this for hashrate charts + member leaderboards.

import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { prisma } from '@hashden/db';
import { resolveMemberPubkey } from '@hashden/shared';

@Controller('hashden/groups/:slug/shares')
export class HashdenSharesController {
  @Get()
  async list(
    @Param('slug') slug: string,
    @Query('sinceMinutes') sinceMinutesRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    group: { slug: string; payoutRule: string };
    sinceMinutes: number;
    count: number;
    shares: { memberPubkey: string; difficulty: number; ts: Date }[];
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, slug: true, payoutRule: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    const sinceMinutes = clampInt(sinceMinutesRaw, { min: 1, max: 24 * 60, fallback: 60 });
    const limit = clampInt(limitRaw, { min: 1, max: 5_000, fallback: 1_000 });
    const since = new Date(Date.now() - sinceMinutes * 60_000);

    const shares = await prisma.share.findMany({
      where: { groupId: group.id, ts: { gte: since } },
      orderBy: { ts: 'desc' },
      take: limit,
      select: { memberPubkey: true, difficulty: true, ts: true },
    });

    // Batch-load the showPubkey preference for every unique pubkey in
    // this result so we can anonymize in bulk. Defaulting to false
    // (anonymize) for any pubkey not in the Member table — that should
    // be empty in practice but stay defensive.
    const uniquePubkeys = [...new Set(shares.map((s) => s.memberPubkey))];
    const prefs = uniquePubkeys.length
      ? await prisma.member.findMany({
          where: {
            groupId: group.id,
            memberPubkey: { in: uniquePubkeys },
          },
          select: { memberPubkey: true, showPubkey: true },
        })
      : [];
    const prefMap = new Map(prefs.map((p) => [p.memberPubkey, p.showPubkey]));

    return {
      group: { slug: group.slug, payoutRule: group.payoutRule },
      sinceMinutes,
      count: shares.length,
      shares: shares.map((s) => ({
        memberPubkey: resolveMemberPubkey(
          s.memberPubkey,
          group.slug,
          prefMap.get(s.memberPubkey),
        ),
        difficulty: s.difficulty,
        ts: s.ts,
      })),
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
