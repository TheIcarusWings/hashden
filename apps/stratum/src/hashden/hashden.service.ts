// HashdenService — bridge between the upstream stratum and Hashden's
// marketplace logic.
//
// **GPL-3.0** — this file lives inside apps/stratum and is part of the
// public-pool fork. It imports MIT-licensed packages from the workspace
// (@hashden/db, @hashden/groups, @hashden/coinbase, @hashden/shared);
// those imports are fine in this direction (the combined work is GPL).
// MIT packages are forbidden from importing FROM apps/stratum.
//
// At this stage the service is scaffolding: it offers methods that the
// upstream share-accept path and template-build path will call once we
// wire them in. No upstream code has been modified yet — wiring happens
// in a follow-up commit so we can land this scaffold and verify the
// build first.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@hashden/db';
import type { PrismaClient } from '@hashden/db';
import {
  GroupRouter,
  computePplnsWindow,
  type RouteDecision,
} from '@hashden/groups';
import {
  buildPplnsCoinbase,
  buildSoloShowcaseCoinbase,
  type PplnsResult,
} from '@hashden/coinbase';
import type { CoinbaseOutput } from '@hashden/shared';

/**
 * Upstream's MiningJob accepts payout information as { address, percent }
 * arrays. We convert from sats-based to percent-based at the boundary.
 * Percent is float — small precision loss; the upstream reconciles
 * floor-rounding leftovers into the first output.
 */
export interface AddressPercent {
  address: string;
  percent: number;
}

@Injectable()
export class HashdenService implements OnModuleDestroy {
  private readonly logger = new Logger(HashdenService.name);
  private readonly db: PrismaClient = prisma;
  private readonly router = new GroupRouter(this.db);

  constructor(private readonly configService: ConfigService) {}

  /** Parse worker username + look up group/member in the DB. */
  async route(workerName: string): Promise<RouteDecision> {
    return this.router.route(workerName);
  }

  /**
   * One-shot helper for the upstream's sendNewMiningJob path: returns the
   * full payout information already in upstream's {address, percent}[]
   * shape, computed from the group's payout rule (SOLO_SHOWCASE or PPLNS).
   *
   * - For SOLO_SHOWCASE: minerPubkey identifies the miner being served
   *   (each miner sees a per-miner template paying their own address).
   * - For PPLNS: minerPubkey is unused (all miners in the group share the
   *   same template).
   */
  async getUpstreamPayoutInformation(
    groupId: string,
    blockRewardSats: bigint,
    minerPubkey: string,
  ): Promise<AddressPercent[]> {
    const group = await this.db.group.findUnique({
      where: { id: groupId },
      select: { payoutRule: true },
    });
    if (!group) throw new Error(`group ${groupId} not found`);

    const platformBtcAddress = this.configService.get<string>('PLATFORM_BTC_ADDRESS');
    const platformFeeBps = Number(this.configService.get<string>('PLATFORM_FEE_BPS') ?? '50');
    if (!platformBtcAddress) {
      throw new Error('PLATFORM_BTC_ADDRESS env var is required for Hashden mode');
    }

    let outputs: CoinbaseOutput[];
    if (group.payoutRule === 'SOLO_SHOWCASE') {
      const r = await this.getSoloShowcasePayouts(
        groupId,
        minerPubkey,
        blockRewardSats,
        platformBtcAddress,
        platformFeeBps,
      );
      outputs = r.outputs;
    } else {
      const dustThresholdSats = BigInt(
        this.configService.get<string>('DUST_THRESHOLD_SATS') ?? '10000',
      );
      const r = await this.getPplnsPayouts(
        groupId,
        blockRewardSats,
        platformBtcAddress,
        platformFeeBps,
        dustThresholdSats,
      );
      outputs = r.outputs;
    }
    return this.toUpstreamPayoutInformation(outputs, blockRewardSats);
  }

  /**
   * Build the per-miner coinbase output list for a SOLO_SHOWCASE group.
   * Called once per template-build per miner, since each miner sees a
   * different template (the winner output goes to their address).
   */
  async getSoloShowcasePayouts(
    groupId: string,
    minerPubkey: string,
    blockRewardSats: bigint,
    platformBtcAddress: string,
    platformFeeBps: number,
  ): Promise<{ outputs: CoinbaseOutput[] }> {
    const [group, member] = await Promise.all([
      this.db.group.findUnique({
        where: { id: groupId },
        select: { feeBps: true, operatorBtcAddress: true, payoutRule: true },
      }),
      this.db.member.findUnique({
        where: { groupId_memberPubkey: { groupId, memberPubkey: minerPubkey } },
        select: { btcAddress: true },
      }),
    ]);
    if (!group) throw new Error(`group ${groupId} not found`);
    if (group.payoutRule !== 'SOLO_SHOWCASE') {
      throw new Error(`group ${groupId} is not SOLO_SHOWCASE`);
    }
    if (!member) throw new Error(`member ${minerPubkey} not in group ${groupId}`);

    const outputs = buildSoloShowcaseCoinbase({
      blockRewardSats,
      minerBtcAddress: member.btcAddress,
      minerPubkey,
      operatorBtcAddress: group.operatorBtcAddress,
      platformBtcAddress,
      operatorFeeBps: group.feeBps,
      platformFeeBps,
    });
    return { outputs };
  }

  /**
   * Build the per-group PPLNS coinbase output list. Called once per
   * template-build per group (all miners in the group see the same
   * coinbase since rewards are weighted by share window, not winner).
   */
  async getPplnsPayouts(
    groupId: string,
    blockRewardSats: bigint,
    platformBtcAddress: string,
    platformFeeBps: number,
    dustThresholdSats: bigint,
    windowSize = 100_000,
  ): Promise<PplnsResult> {
    const group = await this.db.group.findUnique({
      where: { id: groupId },
      select: { feeBps: true, operatorBtcAddress: true, payoutRule: true },
    });
    if (!group) throw new Error(`group ${groupId} not found`);
    if (group.payoutRule !== 'PPLNS') {
      throw new Error(`group ${groupId} is not PPLNS`);
    }
    const members = await computePplnsWindow(this.db, { groupId, windowSize });
    return buildPplnsCoinbase({
      blockRewardSats,
      members,
      operatorBtcAddress: group.operatorBtcAddress,
      platformBtcAddress,
      operatorFeeBps: group.feeBps,
      platformFeeBps,
      dustThresholdSats,
    });
  }

  /**
   * Convert CoinbaseOutput[] (sats) into upstream MiningJob's expected
   * { address, percent } shape. Upstream's createCoinbaseTransaction
   * handles floor-rounding remainder by adding it to outs[0]; we
   * preserve that behavior by listing our outputs in the same order
   * the @hashden/coinbase builder produced them.
   */
  toUpstreamPayoutInformation(
    outputs: CoinbaseOutput[],
    blockRewardSats: bigint,
  ): AddressPercent[] {
    const reward = Number(blockRewardSats);
    return outputs.map((o) => ({
      address: o.address,
      percent: (Number(o.sats) / reward) * 100,
    }));
  }

  /**
   * Append a share to the Hashden shares table. Runs alongside (not
   * instead of) upstream's TypeORM share record — we keep upstream's
   * data untouched while building our parallel marketplace state.
   */
  async recordShare(
    groupId: string,
    memberPubkey: string,
    difficulty: number,
  ): Promise<void> {
    await this.db.share.create({
      data: { groupId, memberPubkey, difficulty },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
