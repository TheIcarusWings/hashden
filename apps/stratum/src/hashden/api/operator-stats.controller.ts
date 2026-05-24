// Per-den operator dashboard stats.
//
// GET /hashden/groups/:slug/operator-stats
//
// Aggregates the den's blocks (a small table) and their coinbaseOutputs
// snapshots into the at-a-glance numbers the operator dashboard (/me)
// surfaces: when the den last found a block, the operator + platform fees
// accumulated across all paid blocks, and a top-members-by-reward
// leaderboard.
//
// No auth: like /blocks and /members/:pubkey/stats, every number here is
// derived from data that is already public (block heights + on-chain
// coinbase outputs). Member pubkeys in the leaderboard are anonymized
// per-den unless the member opted in — same treatment as the blocks
// endpoint, so the operator can't deanonymize their own members. Reads only.

import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { prisma } from '@hashden/db';
import { resolveMemberPubkey } from '@hashden/shared';

interface CoinbaseOutput {
  address: string;
  sats: string;
  memberPubkey?: string;
  kind: 'MEMBER' | 'OPERATOR_FEE' | 'PLATFORM_FEE' | 'DUST_BUCKET';
}

const LEADERBOARD_SIZE = 5;

@Controller('hashden/groups/:slug/operator-stats')
export class HashdenOperatorStatsController {
  @Get()
  async stats(@Param('slug') slug: string): Promise<{
    group: { slug: string };
    lastBlockAt: string | null;
    blockCount: number;
    operatorFeeSats: string;
    platformFeeSats: string;
    leaderboard: { memberPubkey: string; rewardSats: string }[];
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    const blocks = await prisma.block.findMany({
      where: { groupId: group.id },
      orderBy: { foundAt: 'desc' },
      select: { status: true, foundAt: true, coinbaseOutputs: true },
    });

    // Most recent block of any status = "last block found".
    const lastBlockAt = blocks.length > 0 ? blocks[0].foundAt : null;

    // Accumulate fees + per-member rewards. ORPHANED blocks were reorged
    // out — their coinbase never paid — so they're excluded from the
    // accumulated totals and the leaderboard.
    let operatorFee = 0n;
    let platformFee = 0n;
    const memberTotals = new Map<string, bigint>();
    for (const b of blocks) {
      if (b.status === 'ORPHANED') continue;
      const outs = b.coinbaseOutputs as unknown as CoinbaseOutput[] | null;
      if (!Array.isArray(outs)) continue;
      for (const o of outs) {
        const sats = safeBigInt(o.sats);
        switch (o.kind) {
          case 'OPERATOR_FEE':
            operatorFee += sats;
            break;
          case 'PLATFORM_FEE':
            platformFee += sats;
            break;
          case 'MEMBER':
            if (o.memberPubkey) {
              memberTotals.set(
                o.memberPubkey,
                (memberTotals.get(o.memberPubkey) ?? 0n) + sats,
              );
            }
            break;
          // DUST_BUCKET goes to the operator's bucket for off-chain LN
          // fan-out; it isn't attributed to a single member here.
          default:
            break;
        }
      }
    }

    // Top members by accumulated on-chain reward. Anonymize the same way
    // blocks.controller does: one prefs query for the top members, then
    // resolve each pubkey to its anon id unless that member opted in.
    const top = [...memberTotals.entries()]
      .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
      .slice(0, LEADERBOARD_SIZE);
    const prefs = top.length
      ? await prisma.member.findMany({
          where: {
            groupId: group.id,
            memberPubkey: { in: top.map(([pk]) => pk) },
          },
          select: { memberPubkey: true, showPubkey: true },
        })
      : [];
    const prefMap = new Map(prefs.map((p) => [p.memberPubkey, p.showPubkey]));

    return {
      group: { slug: group.slug },
      lastBlockAt: lastBlockAt ? lastBlockAt.toISOString() : null,
      blockCount: blocks.length,
      operatorFeeSats: operatorFee.toString(),
      platformFeeSats: platformFee.toString(),
      leaderboard: top.map(([pk, sats]) => ({
        memberPubkey: resolveMemberPubkey(pk, group.slug, prefMap.get(pk)),
        rewardSats: sats.toString(),
      })),
    };
  }
}

function safeBigInt(v: string | undefined): bigint {
  if (!v) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}
