// Read-only payouts history for a group.
//
// GET /hashden/groups/:slug/payouts?limit=50
//   Returns the most recent PayoutAttempt rows (both ON_CHAIN_COINBASE
//   and LN_DUST kinds), with zapEventId so the web app can deep-link to
//   the kind-9735 zap receipt on njump.me / nostr.band for verification.

import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { prisma } from '@hashden/db';
import { resolveMemberPubkey } from '@hashden/shared';

@Controller('hashden/groups/:slug/payouts')
export class HashdenPayoutsController {
  @Get()
  async list(
    @Param('slug') slug: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    group: { slug: string };
    count: number;
    payouts: any[];
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    const limit = clampInt(limitRaw, { min: 1, max: 200, fallback: 50 });
    const rows = await prisma.payoutAttempt.findMany({
      where: { block: { groupId: group.id } },
      orderBy: { attemptedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        memberPubkey: true,
        amountSats: true,
        kind: true,
        status: true,
        lnPaymentHash: true,
        zapEventId: true,
        attemptedAt: true,
        block: { select: { height: true, hash: true } },
      },
    });

    // Anonymize pubkeys for members who haven't opted in to public display.
    const uniquePubkeys = [...new Set(rows.map((r) => r.memberPubkey))];
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
      group: { slug: group.slug },
      count: rows.length,
      payouts: rows.map((r) => ({
        id: r.id,
        memberPubkey: resolveMemberPubkey(
          r.memberPubkey,
          group.slug,
          prefMap.get(r.memberPubkey),
        ),
        amountSats: r.amountSats.toString(), // BigInt → string for JSON
        kind: r.kind,
        status: r.status,
        lnPaymentHash: r.lnPaymentHash,
        zapEventId: r.zapEventId,
        attemptedAt: r.attemptedAt,
        blockHeight: r.block.height,
        blockHash: r.block.hash,
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
