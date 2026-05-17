// Coinbase preview: shows what each member would receive if a block
// were found right now, given the group's current PPLNS share window.
//
// GET /hashden/groups/:slug/coinbase-preview
//   Pulls the current platform block template (just to read coinbasevalue),
//   computes the would-be payout outputs via the same @hashden/coinbase
//   builders the live stratum uses. Result feeds the web app's preview UI.
//
// Privacy: MEMBER-kind output addresses are redacted to `null` here.
// The preview is a public endpoint; revealing each member's BTC address
// before they've actually won the block would leak the membership roster.
// OPERATOR_FEE / PLATFORM_FEE / DUST_BUCKET addresses are not redacted
// since they're part of the den's public terms. The address shows up on
// chain anyway once a block is actually found.

import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { prisma } from '@hashden/db';
import { computePplnsWindow } from '@hashden/groups';
import {
  buildPplnsCoinbase,
  buildSoloShowcaseCoinbase,
} from '@hashden/coinbase';
import { resolveMemberPubkey } from '@hashden/shared';
import { HashdenService } from '../hashden.service';

@Controller('hashden/groups/:slug/coinbase-preview')
export class HashdenCoinbasePreviewController {
  constructor(private readonly hashden: HashdenService) {}

  @Get()
  async preview(
    @Param('slug') slug: string,
    @Query('rewardSats') rewardSatsRaw?: string,
  ): Promise<{
    group: {
      slug: string;
      payoutRule: string;
      feeBps: number;
      operatorBtcAddress: string;
    };
    blockRewardSats: string;
    outputs: {
      address: string;
      sats: string;
      kind: string;
      memberPubkey?: string;
    }[];
    dustBreakdown: { memberPubkey: string; owedSats: string }[];
    membersInWindow: number;
    note: string;
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        payoutRule: true,
        feeBps: true,
        operatorBtcAddress: true,
      },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    // Use an explicit reward override if supplied (cheaper for the web
    // app's first paint), otherwise pull a fresh template just to read
    // coinbasevalue. We don't want to hit the operator's RPC for a
    // preview either way — keep this on the platform default.
    let rewardSats: bigint;
    if (rewardSatsRaw && /^\d+$/.test(rewardSatsRaw)) {
      rewardSats = BigInt(rewardSatsRaw);
    } else {
      try {
        const { template } = await this.hashden.fetchTemplate(group.id);
        rewardSats = BigInt(template.coinbasevalue);
      } catch {
        // RPC unavailable; fall back to current epoch subsidy + estimated fees.
        rewardSats = 312_500_000n; // 3.125 BTC = post-2024 halving subsidy
      }
    }

    const platformBtcAddress =
      process.env.PLATFORM_BTC_ADDRESS ?? group.operatorBtcAddress;
    const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS ?? '50');
    const dustThresholdSats = BigInt(
      process.env.DUST_THRESHOLD_SATS ?? '10000',
    );

    if (group.payoutRule === 'PPLNS') {
      const members = await computePplnsWindow(prisma, {
        groupId: group.id,
        windowSize: 100_000,
      });
      if (members.length === 0) {
        return {
          group: {
            slug: group.slug,
            payoutRule: group.payoutRule,
            feeBps: group.feeBps,
            operatorBtcAddress: group.operatorBtcAddress,
          },
          blockRewardSats: rewardSats.toString(),
          outputs: [],
          dustBreakdown: [],
          membersInWindow: 0,
          note: 'No shares in window yet — start mining to see projected outputs.',
        };
      }
      const result = buildPplnsCoinbase({
        blockRewardSats: rewardSats,
        members,
        operatorBtcAddress: group.operatorBtcAddress,
        platformBtcAddress,
        operatorFeeBps: group.feeBps,
        platformFeeBps,
        dustThresholdSats,
      });

      // Anonymize pubkeys for members who haven't opted in.
      const pubkeysInPreview = new Set<string>();
      for (const o of result.outputs) {
        if (o.memberPubkey) pubkeysInPreview.add(o.memberPubkey);
      }
      for (const d of result.dustBreakdown) {
        if (d.memberPubkey) pubkeysInPreview.add(d.memberPubkey);
      }
      const prefs = pubkeysInPreview.size
        ? await prisma.member.findMany({
            where: {
              groupId: group.id,
              memberPubkey: { in: [...pubkeysInPreview] },
            },
            select: { memberPubkey: true, showPubkey: true },
          })
        : [];
      const prefMap = new Map(prefs.map((p) => [p.memberPubkey, p.showPubkey]));

      return {
        group: {
          slug: group.slug,
          payoutRule: group.payoutRule,
          feeBps: group.feeBps,
          operatorBtcAddress: group.operatorBtcAddress,
        },
        blockRewardSats: rewardSats.toString(),
        outputs: result.outputs.map((o) => ({
          address: redactMemberAddress(o.kind, o.address),
          sats: o.sats,
          kind: o.kind,
          memberPubkey: o.memberPubkey
            ? resolveMemberPubkey(o.memberPubkey, group.slug, prefMap.get(o.memberPubkey))
            : undefined,
        })),
        dustBreakdown: result.dustBreakdown.map((d) => ({
          memberPubkey: resolveMemberPubkey(
            d.memberPubkey,
            group.slug,
            prefMap.get(d.memberPubkey),
          ),
          owedSats: d.owedSats,
        })),
        membersInWindow: members.length,
        note: `Projected outputs given current PPLNS window of ${members.length} member(s). Member addresses are hidden until a block is actually found.`,
      };
    }

    // SOLO_SHOWCASE: per-miner template; for the preview we synthesize a
    // representative "first member in the share window" as the winner.
    const recentShare = await prisma.share.findFirst({
      where: { groupId: group.id },
      orderBy: { ts: 'desc' },
      select: { memberPubkey: true },
    });
    if (!recentShare) {
      return {
        group: {
          slug: group.slug,
          payoutRule: group.payoutRule,
          feeBps: group.feeBps,
          operatorBtcAddress: group.operatorBtcAddress,
        },
        blockRewardSats: rewardSats.toString(),
        outputs: [],
        dustBreakdown: [],
        membersInWindow: 0,
        note: 'No miners active yet — start mining to see a projected solo-showcase coinbase.',
      };
    }
    const member = await prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: recentShare.memberPubkey,
        },
      },
      select: { btcAddress: true },
    });
    if (!member) {
      throw new HttpException(
        'recent miner no longer registered',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const outputs = buildSoloShowcaseCoinbase({
      blockRewardSats: rewardSats,
      minerBtcAddress: member.btcAddress,
      minerPubkey: recentShare.memberPubkey,
      operatorBtcAddress: group.operatorBtcAddress,
      platformBtcAddress,
      operatorFeeBps: group.feeBps,
      platformFeeBps,
    });
    return {
      group: {
        slug: group.slug,
        payoutRule: group.payoutRule,
        feeBps: group.feeBps,
        operatorBtcAddress: group.operatorBtcAddress,
      },
      blockRewardSats: rewardSats.toString(),
      outputs: outputs.map((o) => ({
        address: redactMemberAddress(o.kind, o.address),
        sats: o.sats,
        kind: o.kind,
        // Strip the winner's pubkey too — pre-block, "who is the most-recent
        // miner" is itself identifying info we don't need to expose.
        memberPubkey: o.kind === 'MEMBER' ? undefined : o.memberPubkey,
      })),
      dustBreakdown: [],
      membersInWindow: 1,
      note: `Solo-showcase preview: the winner gets the full reward (minus fees). The winner's address appears on chain when a block is actually found.`,
    };
  }
}

// MEMBER outputs are payout-targets the den hasn't actually paid yet.
// Returning the address pre-block would let any visitor read off the
// membership roster's payout addresses. The operator/platform/dust
// outputs are part of the den's public terms so we leave those alone.
function redactMemberAddress(kind: string, address: string): string | null {
  return kind === 'MEMBER' ? null : address;
}
