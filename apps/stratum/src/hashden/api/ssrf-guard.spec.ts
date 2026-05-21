import {
  isDisallowedIp,
  parseLightningAddress,
  resolvePublicIp,
  type LookupFn,
} from './ssrf-guard';

describe('parseLightningAddress', () => {
  it('accepts a normal lightning address and lowercases/trims it', () => {
    expect(parseLightningAddress('  Alice@Wallet.COM ')).toEqual({
      user: 'alice',
      host: 'wallet.com',
    });
  });

  it('accepts multi-label hosts', () => {
    expect(parseLightningAddress('a@pay.sub.example.io')).toEqual({
      user: 'a',
      host: 'pay.sub.example.io',
    });
  });

  it('passes wildcard-DNS hostnames (caught later by IP check)', () => {
    // 127.0.0.1.nip.io is a valid hostname; the resolved-IP layer rejects it.
    expect(parseLightningAddress('a@127.0.0.1.nip.io')).toEqual({
      user: 'a',
      host: '127.0.0.1.nip.io',
    });
  });

  it('rejects an explicit port (the Postgres SSRF vector)', () => {
    expect(parseLightningAddress('a@127.0.0.1:5432')).toBeNull();
    expect(parseLightningAddress('a@example.com:8080')).toBeNull();
  });

  it('rejects IPv6 literals (they contain colons)', () => {
    expect(parseLightningAddress('a@::1')).toBeNull();
    expect(parseLightningAddress('a@[::1]')).toBeNull();
  });

  it('rejects bare IPv4 literals (numeric final label)', () => {
    expect(parseLightningAddress('a@10.0.0.1')).toBeNull();
    expect(parseLightningAddress('a@127.0.0.1')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseLightningAddress('alice')).toBeNull();
    expect(parseLightningAddress('a@host')).toBeNull(); // no TLD
    expect(parseLightningAddress('a@@b.com')).toBeNull();
    expect(parseLightningAddress('@b.com')).toBeNull();
    expect(parseLightningAddress('a b@c.com')).toBeNull();
  });
});

describe('isDisallowedIp — IPv4', () => {
  const disallowed = [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1', // CGNAT / Tailscale
    '100.127.255.255',
    '127.0.0.1',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.2.5', // TEST-NET-1
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.7', // TEST-NET-2
    '203.0.113.9', // TEST-NET-3
    '224.0.0.1', // multicast
    '255.255.255.255',
  ];
  it.each(disallowed)('rejects %s', (ip) => {
    expect(isDisallowedIp(ip)).toBe(true);
  });

  const allowed = [
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34', // example.com
    '172.15.0.1', // just below 172.16/12
    '172.32.0.1', // just above 172.16/12
    '100.63.255.255', // just below CGNAT
    '100.128.0.1', // just above CGNAT
    '11.0.0.1',
  ];
  it.each(allowed)('allows public %s', (ip) => {
    expect(isDisallowedIp(ip)).toBe(false);
  });
});

describe('isDisallowedIp — IPv6', () => {
  const disallowed = [
    '::1', // loopback
    '::', // unspecified
    'fe80::1', // link-local
    'fc00::1', // ULA
    'fd12:3456:789a::1', // ULA
    'ff02::1', // multicast
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1', // IPv4-mapped private
    '::ffff:169.254.169.254', // IPv4-mapped metadata
    '2001:db8::1', // documentation
    '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
  ];
  it.each(disallowed)('rejects %s', (ip) => {
    expect(isDisallowedIp(ip)).toBe(true);
  });

  const allowed = [
    '2606:4700:4700::1111', // Cloudflare
    '2001:4860:4860::8888', // Google
    '::ffff:8.8.8.8', // IPv4-mapped public
  ];
  it.each(allowed)('allows public %s', (ip) => {
    expect(isDisallowedIp(ip)).toBe(false);
  });
});

describe('isDisallowedIp — invalid input', () => {
  it.each(['', 'not-an-ip', '999.999.999.999', 'example.com'])(
    'rejects non-IP %p',
    (s) => {
      expect(isDisallowedIp(s)).toBe(true);
    },
  );
});

describe('resolvePublicIp', () => {
  const lookupReturning =
    (records: Array<{ address: string; family: number }>): LookupFn =>
    async () =>
      records;

  it('returns the first IP when all records are public', async () => {
    const lookup = lookupReturning([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    await expect(resolvePublicIp('example.com', lookup)).resolves.toEqual({
      ok: true,
      ip: '93.184.216.34',
    });
  });

  it('rejects when the only record is private', async () => {
    const lookup = lookupReturning([{ address: '127.0.0.1', family: 4 }]);
    await expect(resolvePublicIp('evil.nip.io', lookup)).resolves.toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    });
  });

  it('rejects a split-horizon public+private result', async () => {
    const lookup = lookupReturning([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(resolvePublicIp('split.example', lookup)).resolves.toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    });
  });

  it('returns UNREACHABLE on empty resolution', async () => {
    await expect(
      resolvePublicIp('nope.example', lookupReturning([])),
    ).resolves.toEqual({ ok: false, reason: 'UNREACHABLE' });
  });

  it('returns UNREACHABLE when the lookup throws', async () => {
    const lookup: LookupFn = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(
      resolvePublicIp('nxdomain.example', lookup),
    ).resolves.toEqual({ ok: false, reason: 'UNREACHABLE' });
  });
});
