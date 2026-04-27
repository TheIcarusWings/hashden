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
import {
  BitcoinRpcClient,
  TemplateSourceHealth,
  resolveTemplateSource,
  templateSourceEndpoint,
  type BlockTemplate,
  BitcoinRpcError,
} from '@hashden/templates';
import { StratumV1JobsService, type IJobTemplate } from '../services/stratum-v1-jobs.service';
import type { IBlockTemplate } from '../models/bitcoin-rpc/IBlockTemplate';

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

interface CachedJobTemplate {
  template: IJobTemplate;
  expiresAt: number;
}

@Injectable()
export class HashdenService implements OnModuleDestroy {
  private readonly logger = new Logger(HashdenService.name);
  private readonly db: PrismaClient = prisma;
  private readonly router = new GroupRouter(this.db);
  private readonly templateHealth = new TemplateSourceHealth();
  /** Per-group cache of constructed IJobTemplate. Short TTL — refreshed
   *  on the platform's tick (every few seconds via newMiningJob$). */
  private readonly jobTemplateCache = new Map<string, CachedJobTemplate>();
  private readonly jobTemplateCacheTtlMs = 4_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: StratumV1JobsService,
  ) {}

  /**
   * Fetch a block template for a group, respecting its templateSource
   * config (PLATFORM_DEFAULT or OPERATOR_RPC). Auto-falls back to the
   * platform default when an operator's RPC has been failing — the
   * circuit breaker re-attempts the operator after retryAfterMs.
   *
   * Returns the BlockTemplate plus a flag indicating which source was
   * actually used (useful for ops dashboards and Nostr alert events).
   */
  async fetchTemplate(
    groupId: string,
  ): Promise<{ template: BlockTemplate; usedFallback: boolean }> {
    const group = await this.db.group.findUnique({
      where: { id: groupId },
      select: {
        templateSource: true,
        operatorRpcUrl: true,
        operatorRpcAuth: true,
      },
    });
    if (!group) throw new Error(`group ${groupId} not found`);

    const platform = this.platformDefaults();
    const source = resolveTemplateSource(group, platform);

    // If this group's operator RPC is in fallback (recent consecutive
    // failures), use the platform default instead — caller still gets a
    // valid template, just from the platform's Knots.
    const sourceKey =
      source.kind === 'OPERATOR_RPC' ? `op:${source.url}` : 'platform';
    const useFallback =
      source.kind === 'OPERATOR_RPC' && this.templateHealth.shouldFallback(sourceKey);

    const effectiveSource = useFallback ? { kind: 'PLATFORM_DEFAULT' as const } : source;
    const endpoint = templateSourceEndpoint(effectiveSource, platform);

    const client = new BitcoinRpcClient({
      url: endpoint.url,
      auth: endpoint.auth,
      timeoutMs: 8_000,
    });

    try {
      const template = await client.getBlockTemplate();
      this.templateHealth.recordSuccess(sourceKey);
      return { template, usedFallback: useFallback };
    } catch (err) {
      // For operator-RPC failures, record the failure and try the
      // platform default as a hot fallback for THIS request. We don't
      // recurse — if the platform RPC also fails, that's a hard error.
      if (source.kind === 'OPERATOR_RPC' && !useFallback) {
        this.templateHealth.recordFailure(sourceKey);
        const cause = err instanceof BitcoinRpcError ? err.cause?.kind : 'UNKNOWN';
        this.logger.warn(
          `operator RPC failed (${cause}) for group ${groupId}; trying platform default`,
        );
        const fallbackClient = new BitcoinRpcClient({
          url: platform.url,
          auth: platform.auth,
          timeoutMs: 8_000,
        });
        const template = await fallbackClient.getBlockTemplate();
        return { template, usedFallback: true };
      }
      throw err;
    }
  }

  /**
   * Test whether an operator's RPC URL+auth are working. Returns the tip
   * height on success. Used by the web app's "Test connection" button on
   * the operator settings page so operators can verify config before save.
   */
  async testOperatorRpc(
    url: string,
    auth: string,
    timeoutMs = 5_000,
  ): Promise<{ ok: true; height: number } | { ok: false; reason: string }> {
    const client = new BitcoinRpcClient({ url, auth, timeoutMs });
    try {
      const height = await client.getBlockCount();
      return { ok: true, height };
    } catch (err) {
      const cause = err instanceof BitcoinRpcError ? err.cause?.kind ?? 'UNKNOWN' : 'UNKNOWN';
      return { ok: false, reason: `${cause}: ${(err as Error).message}` };
    }
  }

  private platformDefaults(): { url: string; auth: string } {
    const url = this.configService.get<string>('BITCOIN_RPC_URL');
    const user = this.configService.get<string>('BITCOIN_RPC_USER');
    const password = this.configService.get<string>('BITCOIN_RPC_PASSWORD');
    if (!url || !user || !password) {
      throw new Error(
        'BITCOIN_RPC_URL / BITCOIN_RPC_USER / BITCOIN_RPC_PASSWORD env vars required for Hashden template fetching',
      );
    }
    return { url, auth: `${user}:${password}` };
  }

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

  /**
   * Returns the IJobTemplate that should be served to miners in this group.
   * For PLATFORM_DEFAULT groups, just passes through the upstream's tick.
   * For OPERATOR_RPC groups, fetches the operator's getblocktemplate +
   * builds a per-group IJobTemplate via the same code path the upstream
   * pipe uses (StratumV1JobsService.buildJobTemplate). Cached per group
   * with a short TTL; falls back to the platform default on operator
   * fetch failure (after the circuit breaker has tripped).
   */
  async getEffectiveJobTemplate(
    groupId: string,
    platformDefault: IJobTemplate,
  ): Promise<IJobTemplate> {
    // Cache check first — avoids hitting the DB and the operator RPC on
    // every connected miner's tick.
    const cached = this.jobTemplateCache.get(groupId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.template;
    }

    const group = await this.db.group.findUnique({
      where: { id: groupId },
      select: {
        templateSource: true,
        operatorRpcUrl: true,
        operatorRpcAuth: true,
      },
    });
    if (!group || group.templateSource === 'PLATFORM_DEFAULT') {
      return platformDefault;
    }

    try {
      const { template, usedFallback } = await this.fetchTemplate(groupId);
      if (usedFallback) {
        // Circuit breaker open or hot-fallback fired — fetchTemplate
        // already returned the platform-default raw template. The
        // upstream's platformDefault IJobTemplate covers this case
        // perfectly; no need to rebuild.
        return platformDefault;
      }

      // Operator's raw getblocktemplate response → IJobTemplate via the
      // same upstream code path (coinbase placeholder, merkle branch,
      // segwit witness commit). Inherit clearJobs from the platform tick
      // so all groups invalidate jobs together when a new block is found.
      const ijobTemplate = this.jobsService.buildJobTemplate(
        template.raw as IBlockTemplate,
        platformDefault.blockData.clearJobs,
      );
      this.jobTemplateCache.set(groupId, {
        template: ijobTemplate,
        expiresAt: Date.now() + this.jobTemplateCacheTtlMs,
      });
      return ijobTemplate;
    } catch (e) {
      this.logger.warn(
        `getEffectiveJobTemplate: operator template build failed for group ${groupId}, using platform default: ${(e as Error).message}`,
      );
      return platformDefault;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
