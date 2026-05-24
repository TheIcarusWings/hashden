import { ClientStatisticsService } from '../ORM/client-statistics/client-statistics.service';
import { StratumV1ClientStatistics } from './StratumV1ClientStatistics';

// getSuggestedDifficulty is the vardiff brain. It reads only the in-memory
// submissionCache, so we seed that directly and skip the DB-backed addShares
// path entirely (the service is never touched here).
function seededStats(targetSeconds?: number): StratumV1ClientStatistics {
  const svc = {} as unknown as ClientStatisticsService;
  const stats = targetSeconds == null
    ? new StratumV1ClientStatistics(svc)
    : new StratumV1ClientStatistics(svc, targetSeconds);
  const base = Date.now();
  // 6 shares of difficulty 1000, spaced 1s apart over 5s => 1200 diff/sec.
  (stats as any).submissionCache = Array.from({ length: 6 }, (_, i) => ({
    time: new Date(base + i * 1000),
    difficulty: 1000,
  }));
  return stats;
}

describe('StratumV1ClientStatistics vardiff', () => {
  it('scales the suggested difficulty with the configured share spacing', () => {
    // 1200 diff/sec * spacing => target difficulty, snapped to a power of two.
    expect(seededStats(10).getSuggestedDifficulty(1)).toBe(8192);  // 1200*10=12000 -> 2^13
    expect(seededStats(30).getSuggestedDifficulty(1)).toBe(32768); // 1200*30=36000 -> 2^15
  });

  it('defaults to the upstream 10s spacing', () => {
    expect(seededStats().getSuggestedDifficulty(1)).toBe(8192);
  });

  it('returns null (no change) when the client is already within ~2x of target', () => {
    // target=12000; client=8192 -> 8192*2=16384 !< 12000 and 8192/2=4096 !> 12000.
    expect(seededStats(10).getSuggestedDifficulty(8192)).toBeNull();
  });
});
