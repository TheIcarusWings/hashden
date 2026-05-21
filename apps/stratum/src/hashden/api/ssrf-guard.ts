// SSRF guard for the LNURL probe.
//
// The probe makes an outbound HTTPS request to a user-supplied host. Without
// guards an attacker can aim it at internal addresses (127.0.0.1, RFC1918,
// the Tailnet/CGNAT range, link-local cloud metadata, IPv6 loopback) and use
// the stratum container as a port-scanner-by-proxy. We defend in three layers:
//
//   1. parseLightningAddress — accept only a bare `name@domain.tld`. A literal
//      ':' is rejected outright, so a port (`host:5432`) or an IPv6 literal can
//      never reach the resolver.
//   2. resolvePublicIp — resolve the host once and reject if *any* returned
//      address is non-public-unicast (a split-horizon A/AAAA mix is a classic
//      SSRF trick).
//   3. fetchPinned — connect straight to the validated IP with the original
//      host kept only for SNI + cert identity, so a DNS rebind can't swap in a
//      private address between the check and the connect.
//
// All transport-level failures collapse to a single opaque `UNREACHABLE` reason
// so the response can't fingerprint internal services.

import * as dns from 'node:dns';
import * as https from 'node:https';
import * as net from 'node:net';

export interface ParsedAddress {
  user: string;
  host: string;
}

// LUD-16 lightning address: `name@domain`. The host must end in an alphabetic
// TLD, which on its own already rejects bare IPv4 literals (`10.0.0.1` ends in
// a numeric label). Hostnames like `127.0.0.1.nip.io` still pass here by design
// — they're valid DNS names and get caught later by the resolved-IP check.
const ADDRESS_RE = /^([^\s@]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/;

export function parseLightningAddress(raw: string): ParsedAddress | null {
  const addr = raw.trim().toLowerCase();
  if (addr.includes(':')) return null; // no ports, no IPv6 literals
  const m = addr.match(ADDRESS_RE);
  if (!m) return null;
  return { user: m[1]!, host: m[2]! };
}

// --- IP classification -----------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const octet = Number(p);
    if (octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

// Non-public-unicast IPv4 blocks (loopback, private, CGNAT/Tailnet, link-local
// incl. cloud metadata, multicast, reserved). Explicit allowlist-by-exclusion —
// the `ip` npm package misses several of these.
const V4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT — also the Tailscale/100.x range
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local incl. 169.254.169.254 metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + 255.255.255.255 broadcast
];

function isDisallowedIpv4(n: number): boolean {
  for (const [base, prefix] of V4_BLOCKS) {
    const b = ipv4ToInt(base)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if (((n & mask) >>> 0) === ((b & mask) >>> 0)) return true;
  }
  return false;
}

function ipv6ToBigInt(ip: string): bigint | null {
  ip = ip.split('%')[0]!; // strip a zone id (fe80::1%eth0)

  // Fold a trailing embedded IPv4 (::ffff:1.2.3.4, 64:ff9b::1.2.3.4) into hex.
  const dot = ip.indexOf('.');
  if (dot !== -1) {
    const colon = ip.lastIndexOf(':', dot);
    if (colon === -1) return null;
    const v4 = ipv4ToInt(ip.slice(colon + 1));
    if (v4 === null) return null;
    const g1 = ((v4 >>> 16) & 0xffff).toString(16);
    const g2 = (v4 & 0xffff).toString(16);
    ip = ip.slice(0, colon + 1) + g1 + ':' + g2;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1]!.split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // '::' must stand in for >= 1 group
    groups = [...head, ...new Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    result = (result << 16n) | BigInt(parseInt(g, 16));
  }
  return result;
}

function isDisallowedIpv6(n: bigint): boolean {
  if (n === 0n) return true; // ::  unspecified
  if (n === 1n) return true; // ::1 loopback

  const top96 = n >> 32n;
  // IPv4-mapped (::ffff:0:0/96) and deprecated IPv4-compatible (::/96): the
  // real destination is the embedded IPv4, so judge that.
  if (top96 === 0xffffn) return isDisallowedIpv4(Number(n & 0xffffffffn));
  if (top96 === 0n) return true;
  if (top96 === 0x64ff9bn << 64n) {
    // 64:ff9b::/96 NAT64 — embedded IPv4
    return isDisallowedIpv4(Number(n & 0xffffffffn));
  }

  if (n >> 121n === 0b1111110n) return true; // fc00::/7  unique local
  if (n >> 118n === 0b1111111010n) return true; // fe80::/10 link-local
  if (n >> 120n === 0xffn) return true; // ff00::/8  multicast
  if (n >> 112n === 0x2002n) {
    // 2002::/16 6to4 — embedded IPv4 in the next 32 bits
    return isDisallowedIpv4(Number((n >> 80n) & 0xffffffffn));
  }
  if (n >> 96n === 0x20010db8n) return true; // 2001:db8::/32 documentation

  return false;
}

/** True for any address that is not public unicast (or not a valid IP). */
export function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return n === null ? true : isDisallowedIpv4(n);
  }
  if (net.isIPv6(ip)) {
    const n = ipv6ToBigInt(ip);
    return n === null ? true : isDisallowedIpv6(n);
  }
  return true;
}

// --- Resolution + pinned fetch ---------------------------------------------

export type LookupFn = (
  host: string,
  opts: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (host, opts) =>
  dns.promises.lookup(host, opts) as Promise<
    Array<{ address: string; family: number }>
  >;

// Sibling fields are declared optional-undefined on the opposite variant so
// callers can read `.reason` / `.ip` without discriminant narrowing — this app
// builds with strictNullChecks off, which would otherwise reject the access.
export type ResolveResult =
  | { ok: true; ip: string; reason?: undefined }
  | { ok: false; reason: 'PRIVATE_HOST' | 'UNREACHABLE'; ip?: undefined };

export async function resolvePublicIp(
  host: string,
  lookup: LookupFn = defaultLookup,
): Promise<ResolveResult> {
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: 'UNREACHABLE' };
  }
  if (!records.length) return { ok: false, reason: 'UNREACHABLE' };
  // Reject if ANY resolved address is non-public — a host that returns one
  // public and one private record is a split-horizon SSRF trick.
  for (const r of records) {
    if (isDisallowedIp(r.address)) return { ok: false, reason: 'PRIVATE_HOST' };
  }
  return { ok: true, ip: records[0]!.address };
}

export type FetchResult =
  | { ok: true; status: number; body: string; reason?: undefined }
  | { ok: false; reason: 'UNREACHABLE'; status?: undefined; body?: undefined };

/**
 * GET `url` over HTTPS, connecting only to the pre-validated `ip`. The original
 * hostname is used solely for SNI, certificate identity, and the Host header —
 * because the connection target is already a literal IP, no second DNS lookup
 * happens, so a rebind between resolvePublicIp() and here is impossible.
 */
export function fetchPinned(
  url: URL,
  ip: string,
  timeoutMs = 5000,
  maxBytes = 64 * 1024,
): Promise<FetchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: FetchResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const req = https.request(
      {
        host: ip, // connect to the validated address only
        servername: url.hostname, // SNI + cert identity use the real host
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: { host: url.hostname, accept: 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > maxBytes) {
            req.destroy();
            done({ ok: false, reason: 'UNREACHABLE' });
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          done({
            ok: true,
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', () => done({ ok: false, reason: 'UNREACHABLE' }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => done({ ok: false, reason: 'UNREACHABLE' }));
    req.end();
  });
}
