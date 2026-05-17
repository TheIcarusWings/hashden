// Read-only REST endpoint for blocks found by a group.
// Web app reads this for the group's "Recent blocks" section + leaderboard.

import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { prisma } from '@hashden/db';
import { resolveMemberPubkey } from '@hashden/shared';

interface CoinbaseOutput {
  address: string;
  sats: string;
  memberPubkey?: string;
  kind: 'MEMBER' | 'OPERATOR_FEE' | 'PLATFORM_FEE' | 'DUST_BUCKET';
}

@Controller('hashden/groups/:slug/blocks')
export class HashdenBlocksController {
  @Get()
  async list(
    @Param('slug') slug: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ group: { slug: string }; count: number; blocks: any[] }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    const limit = clampInt(limitRaw, { min: 1, max: 200, fallback: 25 });
    const blocks = await prisma.block.findMany({
      where: { groupId: group.id },
      orderBy: { foundAt: 'desc' },
      take: limit,
      select: {
        id: true,
        height: true,
        hash: true,
        rewardSats: true,
        status: true,
        foundAt: true,
        maturedAt: true,
        coinbaseOutputs: true,
      },
    });

    // The coinbaseOutputs JSON has the real on-chain BTC addresses
    // (immutable, public) but also stores the memberPubkey alongside.
    // The address is unavoidably public — it's on chain — but the pubkey
    // linkage is something we can opt members out of. Collect every
    // pubkey referenced across all blocks' outputs, fetch their prefs in
    // one query, then rewrite.
    const allPubkeys = new Set<string>();
    for (const b of blocks) {
      const outs = b.coinbaseOutputs as unknown as CoinbaseOutput[] | null;
      if (!Array.isArray(outs)) continue;
      for (const o of outs) {
        if (o.memberPubkey) allPubkeys.add(o.memberPubkey);
      }
    }
    const prefs = allPubkeys.size
      ? await prisma.member.findMany({
          where: {
            groupId: group.id,
            memberPubkey: { in: [...allPubkeys] },
          },
          select: { memberPubkey: true, showPubkey: true },
        })
      : [];
    const prefMap = new Map(prefs.map((p) => [p.memberPubkey, p.showPubkey]));

    return {
      group: { slug: group.slug },
      count: blocks.length,
      blocks: blocks.map((b) => {
        const outs = b.coinbaseOutputs as unknown as CoinbaseOutput[] | null;
        const rewritten = Array.isArray(outs)
          ? outs.map((o) => ({
              ...o,
              memberPubkey: o.memberPubkey
                ? resolveMemberPubkey(
                    o.memberPubkey,
                    group.slug,
                    prefMap.get(o.memberPubkey),
                  )
                : undefined,
            }))
          : outs;
        return {
          ...b,
          rewardSats: b.rewardSats.toString(),
          coinbaseOutputs: rewritten,
        };
      }),
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
