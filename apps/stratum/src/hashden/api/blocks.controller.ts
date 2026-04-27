// Read-only REST endpoint for blocks found by a group.
// Web app reads this for the group's "Recent blocks" section + leaderboard.

import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { prisma } from '@hashden/db';

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

    return {
      group: { slug: group.slug },
      count: blocks.length,
      blocks: blocks.map((b) => ({
        ...b,
        // BigInt → string for JSON serialization
        rewardSats: b.rewardSats.toString(),
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
