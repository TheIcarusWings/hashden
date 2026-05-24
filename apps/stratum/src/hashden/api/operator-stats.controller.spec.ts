// Operator-stats aggregation coverage.
//
// Verifies the per-den operator dashboard numbers: last-block time, the
// accumulated operator + platform fees, ORPHANED exclusion, and the
// top-members leaderboard (sorted desc, anonymized unless opted in).

import { HashdenOperatorStatsController } from './operator-stats.controller';
import { prisma } from '@hashden/db';

jest.mock('@hashden/db', () => ({
  prisma: {
    group: { findUnique: jest.fn() },
    block: { findMany: jest.fn() },
    member: { findMany: jest.fn() },
  },
}));
// @hashden/shared ships ESM jest won't transform; stub the one helper used
// with the same opt-in/anon semantics so we can assert anonymization.
jest.mock('@hashden/shared', () => ({
  resolveMemberPubkey: (pk: string, _slug: string, show: boolean | null | undefined) =>
    show === true ? pk : `anon-${pk.slice(0, 8)}`,
}));

const groupFind = prisma.group.findUnique as unknown as jest.Mock;
const blockFind = prisma.block.findMany as unknown as jest.Mock;
const memberFind = prisma.member.findMany as unknown as jest.Mock;

const PK = (n: string) => n.repeat(64).slice(0, 64);

describe('HashdenOperatorStatsController.stats', () => {
  let controller: HashdenOperatorStatsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HashdenOperatorStatsController();
    groupFind.mockResolvedValue({ id: 'g1', slug: 'my-den' });
    memberFind.mockResolvedValue([]);
  });

  it('404s when the den does not exist', async () => {
    groupFind.mockResolvedValue(null);
    await expect(controller.stats('nope')).rejects.toThrow(/not found/);
  });

  it('returns zeros and a null last-block when there are no blocks', async () => {
    blockFind.mockResolvedValue([]);
    const res = await controller.stats('my-den');
    expect(res).toEqual({
      group: { slug: 'my-den' },
      lastBlockAt: null,
      blockCount: 0,
      operatorFeeSats: '0',
      platformFeeSats: '0',
      leaderboard: [],
    });
  });

  it('aggregates fees + leaderboard, excludes ORPHANED, sorts desc, anonymizes', async () => {
    // Pre-sorted newest-first, as prisma's `orderBy foundAt desc` returns.
    blockFind.mockResolvedValue([
      {
        // Reorged out — newest, so it sets last-block time, but its
        // coinbase never paid: excluded from fees + the leaderboard.
        status: 'ORPHANED',
        foundAt: new Date('2026-05-21T00:00:00.000Z'),
        coinbaseOutputs: [
          { kind: 'OPERATOR_FEE', sats: '99999', address: 'a' },
          { kind: 'MEMBER', sats: '99999', address: 'c', memberPubkey: PK('a') },
        ],
      },
      {
        status: 'MATURED',
        foundAt: new Date('2026-05-20T00:00:00.000Z'),
        coinbaseOutputs: [
          { kind: 'OPERATOR_FEE', sats: '1000', address: 'a' },
          { kind: 'PLATFORM_FEE', sats: '500', address: 'b' },
          { kind: 'MEMBER', sats: '3000', address: 'c', memberPubkey: PK('a') },
          { kind: 'MEMBER', sats: '7000', address: 'd', memberPubkey: PK('b') },
          { kind: 'DUST_BUCKET', sats: '50', address: 'e' },
        ],
      },
      {
        status: 'FOUND',
        foundAt: new Date('2026-05-10T00:00:00.000Z'),
        coinbaseOutputs: [
          { kind: 'OPERATOR_FEE', sats: '200', address: 'a' },
          { kind: 'MEMBER', sats: '5000', address: 'c', memberPubkey: PK('a') },
        ],
      },
    ]);
    // PK('b') opted in to public display; PK('a') did not.
    memberFind.mockResolvedValue([{ memberPubkey: PK('b'), showPubkey: true }]);

    const res = await controller.stats('my-den');

    // last block = the most recent of ANY status (the orphaned one is newest).
    expect(res.lastBlockAt).toBe('2026-05-21T00:00:00.000Z');
    expect(res.blockCount).toBe(3);
    // operator: 1000 + 200 (orphaned 99999 excluded); platform: 500.
    expect(res.operatorFeeSats).toBe('1200');
    expect(res.platformFeeSats).toBe('500');
    // PK('a') total = 3000 + 5000 = 8000 (top); PK('b') = 7000.
    expect(res.leaderboard).toHaveLength(2);
    expect(res.leaderboard[0].rewardSats).toBe('8000');
    expect(res.leaderboard[1].rewardSats).toBe('7000');
    // PK('a') did not opt in → anonymized; PK('b') opted in → raw pubkey.
    expect(res.leaderboard[0].memberPubkey).toBe(`anon-${PK('a').slice(0, 8)}`);
    expect(res.leaderboard[1].memberPubkey).toBe(PK('b'));
  });
});
