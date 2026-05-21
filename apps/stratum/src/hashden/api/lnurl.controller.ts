// LNURL-pay probe endpoint.
//
// Member-join validation in the web app calls this before persisting:
// passes the lightning address (user@host), we fetch the LUD-16 well-
// known endpoint and confirm the host returns a valid LNURL-pay
// metadata document. Catches typos and dead Lightning addresses early
// (otherwise the failure shows up post-block at dust-fanout time, way
// too late).
//
// Server-side fetch (not client-side) because many wallet hosts don't
// set CORS headers for the public endpoint. Because it's an outbound
// request to a user-supplied host, every fetch goes through the SSRF
// guard in ./ssrf-guard — see that file for the threat model.

import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { fetchPinned, parseLightningAddress, resolvePublicIp } from './ssrf-guard';

interface ProbeBody {
  lightningAddress: string;
}

interface ProbeResult {
  ok: true;
  minSendable: number;
  maxSendable: number;
  callback: string;
}

type ProbeResponse = ProbeResult | { ok: false; reason: string };

@Controller('hashden/lnurl')
export class HashdenLnurlController {
  // LNURL probe makes an outbound HTTPS request per call — we don't want
  // to be a free port-scanner-by-proxy. 30/hour per IP is generous for a
  // human filling the join form (1 probe per click) but kills automated
  // probing. The SSRF guard below is the real defense; the limit is depth.
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('probe')
  async probe(@Body() body: ProbeBody): Promise<ProbeResponse> {
    if (!body || typeof body.lightningAddress !== 'string') {
      throw new HttpException(
        'lightningAddress required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const parsed = parseLightningAddress(body.lightningAddress);
    if (!parsed) {
      return { ok: false, reason: 'INVALID_FORMAT' };
    }

    // Resolve + reject non-public addresses before any connection is made.
    const resolved = await resolvePublicIp(parsed.host);
    if (!resolved.ok) {
      return { ok: false, reason: resolved.reason };
    }

    const url = new URL(
      `https://${parsed.host}/.well-known/lnurlp/${encodeURIComponent(parsed.user)}`,
    );
    const res = await fetchPinned(url, resolved.ip);
    if (!res.ok) {
      return { ok: false, reason: res.reason };
    }
    if (res.status < 200 || res.status >= 300) {
      // Host is already known-public, so its HTTP status leaks no internal
      // topology and is useful for diagnosing typos.
      return { ok: false, reason: `HTTP_${res.status}` };
    }

    let json: any;
    try {
      json = JSON.parse(res.body);
    } catch {
      return { ok: false, reason: 'INVALID_JSON' };
    }
    if (json?.tag !== 'payRequest') {
      return { ok: false, reason: 'NOT_PAY_REQUEST' };
    }
    if (typeof json.callback !== 'string') {
      return { ok: false, reason: 'MISSING_CALLBACK' };
    }
    if (
      typeof json.minSendable !== 'number' ||
      typeof json.maxSendable !== 'number'
    ) {
      return { ok: false, reason: 'MISSING_SENDABLE_RANGE' };
    }
    return {
      ok: true,
      minSendable: json.minSendable,
      maxSendable: json.maxSendable,
      callback: json.callback,
    };
  }
}
