// Replay-protection coverage for member join (MED-04).
//
// The funds-routing risk: a member's join event is a public kind-30078.
// After a member rotates their wallet (new btc_address), an attacker who
// kept the OLD join event could replay it to roll the address back to the
// abandoned one and redirect future block rewards. The ±5 min freshness
// window makes that old event un-replayable.

import { HashdenMembersController } from './members.controller';
import { prisma } from '@hashden/db';
import { verifyEvent } from 'nostr-tools';
import { validate as validateBitcoinAddress } from 'bitcoin-address-validation';

jest.mock('@hashden/db', () => ({
  prisma: {
    group: { findUnique: jest.fn() },
    member: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('nostr-tools', () => ({ verifyEvent: jest.fn() }));
jest.mock('bitcoin-address-validation', () => ({ validate: jest.fn() }));

const groupFind = prisma.group.findUnique as unknown as jest.Mock;
const memberUpsert = prisma.member.upsert as unknown as jest.Mock;
const verifyMock = verifyEvent as unknown as jest.Mock;
const btcMock = validateBitcoinAddress as unknown as jest.Mock;

const PUBKEY = 'a'.repeat(64);
const nowSec = () => Math.floor(Date.now() / 1000);

function joinEvent(createdAt: number) {
  return {
    id: 'evt',
    kind: 30078,
    pubkey: PUBKEY,
    created_at: createdAt,
    tags: [['d', 'member:my-den']],
    content: JSON.stringify({
      btc_address: 'bc1qexampleaddress',
      lightning_address: 'miner@example.com',
    }),
    sig: 'deadbeef',
  };
}

describe('HashdenMembersController.join — replay protection', () => {
  let controller: HashdenMembersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HashdenMembersController();
    groupFind.mockResolvedValue({ id: 'g1', visibility: 'PUBLIC' });
    verifyMock.mockReturnValue(true);
    btcMock.mockReturnValue(true);
  });

  it('rejects a stale join event (wallet-rotation replay) without verifying or writing', async () => {
    await expect(
      controller.join('my-den', { signedEvent: joinEvent(nowSec() - 600) }),
    ).rejects.toThrow(/out of window/);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it('rejects a join event dated too far in the future', async () => {
    await expect(
      controller.join('my-den', { signedEvent: joinEvent(nowSec() + 600) }),
    ).rejects.toThrow(/out of window/);
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it('accepts a fresh join event and upserts the member', async () => {
    memberUpsert.mockResolvedValue({});
    const res = await controller.join('my-den', {
      signedEvent: joinEvent(nowSec()),
    });
    expect(res).toEqual({ ok: true, memberPubkey: PUBKEY });
    expect(memberUpsert).toHaveBeenCalledTimes(1);
  });
});
