// Replay-protection coverage for group create/update (MED-04).
//
// A group-metadata kind-30078 event is public. Without a freshness window,
// an old signed event could be replayed to silently revert operator
// settings (fee_bps, operator BTC address, RPC source) to a stale state.
// The ±5 min window — matching delete() — closes that.

import { HashdenGroupsController } from './groups.controller';
import { verifyEvent } from 'nostr-tools';

jest.mock('@hashden/db', () => ({
  prisma: {
    group: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    member: { create: jest.fn() },
  },
}));
jest.mock('nostr-tools', () => ({ verifyEvent: jest.fn() }));
// @hashden/nostr ships ESM that jest doesn't transform; these helpers run
// only after the checks under test, so a stub keeps the import graph CJS.
jest.mock('@hashden/nostr', () => ({
  parseAddressableTag: jest.fn(),
  parseGroupMetadataContent: jest.fn(),
}));
// Avoids pulling the @hashden/crypto chain; the controller takes a creds
// stub in these tests and never touches the real service.
jest.mock('../operator-creds.service', () => ({ OperatorCredsService: class {} }));

const verifyMock = verifyEvent as unknown as jest.Mock;

const PUBKEY = 'a'.repeat(64);
const nowSec = () => Math.floor(Date.now() / 1000);

function createEvent(createdAt: number) {
  return {
    id: 'evt',
    kind: 30078,
    pubkey: PUBKEY,
    created_at: createdAt,
    tags: [['d', 'my-den']],
    content: '{}',
    sig: 'deadbeef',
  };
}

describe('HashdenGroupsController.create — replay protection', () => {
  let controller: HashdenGroupsController;
  // create() only touches creds when a row is actually written; these tests
  // stop before that, so a stub is enough.
  const fakeCreds = { available: false, encrypt: (s: string) => s } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HashdenGroupsController(fakeCreds);
  });

  it('rejects a stale create/update event before verifying the signature', async () => {
    await expect(
      controller.create({ signedEvent: createEvent(nowSec() - 600) }),
    ).rejects.toThrow(/out of window/);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('rejects an event dated too far in the future', async () => {
    await expect(
      controller.create({ signedEvent: createEvent(nowSec() + 600) }),
    ).rejects.toThrow(/out of window/);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('lets a fresh event past the freshness gate (reaches signature check)', async () => {
    // Force the signature check to fail: proves the freshness gate passed
    // and execution advanced to verifyEvent without doing a full create.
    verifyMock.mockReturnValue(false);
    await expect(
      controller.create({ signedEvent: createEvent(nowSec()) }),
    ).rejects.toThrow(/invalid signature/);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
});
