import { Test, TestingModule } from '@nestjs/testing';
import { HashdenLnurlController } from './lnurl.controller';
import * as guard from './ssrf-guard';

jest.mock('./ssrf-guard', () => ({
  parseLightningAddress: jest.fn(),
  resolvePublicIp: jest.fn(),
  fetchPinned: jest.fn(),
}));

const parseMock = guard.parseLightningAddress as jest.Mock;
const resolveMock = guard.resolvePublicIp as jest.Mock;
const fetchMock = guard.fetchPinned as jest.Mock;

describe('HashdenLnurlController', () => {
  let controller: HashdenLnurlController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HashdenLnurlController],
    }).compile();
    controller = module.get(HashdenLnurlController);
  });

  it('rejects a malformed address without resolving or fetching', async () => {
    parseMock.mockReturnValue(null);
    const res = await controller.probe({ lightningAddress: 'nope' });
    expect(res).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
    expect(resolveMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a private host without ever fetching', async () => {
    parseMock.mockReturnValue({ user: 'a', host: 'evil.nip.io' });
    resolveMock.mockResolvedValue({ ok: false, reason: 'PRIVATE_HOST' });
    const res = await controller.probe({ lightningAddress: 'a@evil.nip.io' });
    expect(res).toEqual({ ok: false, reason: 'PRIVATE_HOST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces UNREACHABLE from the pinned fetch', async () => {
    parseMock.mockReturnValue({ user: 'a', host: 'example.com' });
    resolveMock.mockResolvedValue({ ok: true, ip: '93.184.216.34' });
    fetchMock.mockResolvedValue({ ok: false, reason: 'UNREACHABLE' });
    const res = await controller.probe({ lightningAddress: 'a@example.com' });
    expect(res).toEqual({ ok: false, reason: 'UNREACHABLE' });
  });

  it('returns the sendable range on a valid payRequest', async () => {
    parseMock.mockReturnValue({ user: 'a', host: 'example.com' });
    resolveMock.mockResolvedValue({ ok: true, ip: '93.184.216.34' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({
        tag: 'payRequest',
        callback: 'https://example.com/lnurl/cb',
        minSendable: 1000,
        maxSendable: 100000,
      }),
    });
    const res = await controller.probe({ lightningAddress: 'a@example.com' });
    expect(res).toEqual({
      ok: true,
      minSendable: 1000,
      maxSendable: 100000,
      callback: 'https://example.com/lnurl/cb',
    });
  });

  it('reports a non-2xx upstream status', async () => {
    parseMock.mockReturnValue({ user: 'a', host: 'example.com' });
    resolveMock.mockResolvedValue({ ok: true, ip: '93.184.216.34' });
    fetchMock.mockResolvedValue({ ok: true, status: 404, body: 'nope' });
    const res = await controller.probe({ lightningAddress: 'a@example.com' });
    expect(res).toEqual({ ok: false, reason: 'HTTP_404' });
  });

  it('rejects a response that is not a payRequest', async () => {
    parseMock.mockReturnValue({ user: 'a', host: 'example.com' });
    resolveMock.mockResolvedValue({ ok: true, ip: '93.184.216.34' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({ tag: 'withdrawRequest' }),
    });
    const res = await controller.probe({ lightningAddress: 'a@example.com' });
    expect(res).toEqual({ ok: false, reason: 'NOT_PAY_REQUEST' });
  });
});
