// Aggregated hashrate over a window, bucketed for charting.
//
// GET /hashden/groups/:slug/hashrate?windowMinutes=1440&buckets=48
//
// Aggregation: bucket the den's Share rows by time, sum each bucket's
// difficulty, convert to hashrate via the standard formula
//     hashrate_Hs = (sum(difficulty) * 2^32) / bucket_seconds
// 2^32 is the average number of hash attempts per share at difficulty 1.
//
// Also returns a "current" rolling estimate over the most recent
// CURRENT_WINDOW_MINUTES so the page can show a prominent number that
// doesn't lag a whole bucket behind reality.
//
// No charting lib on the web side — the response shape stays simple
// (array of {ts, hashrateHs, shareCount}) so a small SVG component
// can render it without dependencies.

import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { prisma } from '@hashden/db';

// Conservative caps so a misconfigured client can't dump the entire
// share table. Larger windows are still useful (7-day trend) but the
// per-bucket math is happy with up to a few hundred buckets.
const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 7 * 24 * 60; // 7 days
const MIN_BUCKETS = 6;
const MAX_BUCKETS = 200;
const DEFAULT_WINDOW_MINUTES = 24 * 60;
const DEFAULT_BUCKETS = 48; // 30-min buckets over 24h

// Sliding window for the headline "current" number. Short enough to
// react quickly to a Bitaxe starting/stopping, long enough to smooth
// out per-share variance.
const CURRENT_WINDOW_MINUTES = 10;

const SHARE_HASHES = 2n ** 32n;

@Controller('hashden/groups/:slug/hashrate')
export class HashdenHashrateController {
  @Get()
  async show(
    @Param('slug') slug: string,
    @Query('windowMinutes') windowRaw?: string,
    @Query('buckets') bucketsRaw?: string,
  ): Promise<{
    group: { slug: string };
    windowMinutes: number;
    bucketMinutes: number;
    currentWindowMinutes: number;
    currentHashrateHs: string;
    currentShareCount: number;
    buckets: { ts: string; hashrateHs: string; shareCount: number }[];
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    const windowMinutes = clampInt(windowRaw, {
      min: MIN_WINDOW_MINUTES,
      max: MAX_WINDOW_MINUTES,
      fallback: DEFAULT_WINDOW_MINUTES,
    });
    const numBuckets = clampInt(bucketsRaw, {
      min: MIN_BUCKETS,
      max: MAX_BUCKETS,
      fallback: DEFAULT_BUCKETS,
    });
    const bucketMinutes = Math.max(1, Math.floor(windowMinutes / numBuckets));
    const bucketSeconds = BigInt(bucketMinutes * 60);

    // Align bucket starts to wall-clock multiples of bucketMinutes so
    // repeated requests produce stable bucket boundaries. Without this,
    // the same share could land in different buckets across two requests
    // a few seconds apart.
    const now = Date.now();
    const bucketMs = bucketMinutes * 60_000;
    const windowEndMs = Math.floor(now / bucketMs) * bucketMs;
    const windowStartMs = windowEndMs - windowMinutes * 60_000;

    // Single query, two aggregations: bucketed for the chart + a
    // separate sum for the headline number. Using $queryRaw because
    // Prisma's groupBy can't combine date_bin + sum cleanly.
    const buckets = await prisma.$queryRaw<
      { bucket: Date; work: number; share_count: bigint }[]
    >`
      SELECT
        date_bin(
          ${`${bucketMinutes} minutes`}::interval,
          ts,
          ${new Date(windowStartMs)}::timestamp
        ) AS bucket,
        SUM(difficulty)::float8 AS work,
        COUNT(*)::bigint AS share_count
      FROM "Share"
      WHERE "groupId" = ${group.id}
        AND ts >= ${new Date(windowStartMs)}
        AND ts < ${new Date(windowEndMs)}
      GROUP BY bucket
      ORDER BY bucket
    `;

    // Fill in zero-buckets so the chart has a continuous x-axis even
    // for low-hashrate dens with sporadic shares. Map by bucket-start
    // for O(1) lookup.
    const bucketByStart = new Map<number, { work: number; shareCount: number }>();
    for (const b of buckets) {
      bucketByStart.set(b.bucket.getTime(), {
        work: b.work ?? 0,
        shareCount: Number(b.share_count),
      });
    }
    const filledBuckets: {
      ts: string;
      hashrateHs: string;
      shareCount: number;
    }[] = [];
    for (let t = windowStartMs; t < windowEndMs; t += bucketMs) {
      const cell = bucketByStart.get(t) ?? { work: 0, shareCount: 0 };
      // bigint math to avoid float overflow at high hashrates
      const hashrateHs =
        cell.work > 0
          ? (BigInt(Math.round(cell.work)) * SHARE_HASHES) / bucketSeconds
          : 0n;
      filledBuckets.push({
        ts: new Date(t).toISOString(),
        hashrateHs: hashrateHs.toString(),
        shareCount: cell.shareCount,
      });
    }

    // Headline "current" estimate — rolling sliding window, separate
    // from bucket boundaries so a Bitaxe that just connected doesn't
    // wait up to bucketMinutes to register.
    const currentSince = new Date(now - CURRENT_WINDOW_MINUTES * 60_000);
    const current = await prisma.share.aggregate({
      where: { groupId: group.id, ts: { gte: currentSince } },
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
      group: { slug: group.slug },
      windowMinutes,
      bucketMinutes,
      currentWindowMinutes: CURRENT_WINDOW_MINUTES,
      currentHashrateHs: currentHashrateHs.toString(),
      currentShareCount: current._count._all,
      buckets: filledBuckets,
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
