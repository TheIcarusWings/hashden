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
// set CORS headers for the public endpoint.

import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

interface ProbeBody {
  lightningAddress: string;
}

interface ProbeResult {
  ok: true;
  minSendable: number;
  maxSendable: number;
  callback: string;
}

@Controller('hashden/lnurl')
export class HashdenLnurlController {
  // LNURL probe makes an outbound HTTPS request per call — we don't want
  // to be a free port-scanner-by-proxy. 30/hour per IP is generous for a
  // human filling the join form (1 probe per click) but kills automated
  // probing.
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('probe')
  async probe(
    @Body() body: ProbeBody,
  ): Promise<ProbeResult | { ok: false; reason: string }> {
    if (!body || typeof body.lightningAddress !== 'string') {
      throw new HttpException(
        'lightningAddress required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const addr = body.lightningAddress.trim().toLowerCase();
    const m = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(addr);
    if (!m) {
      return { ok: false, reason: 'INVALID_FORMAT' };
    }
    const [, user, host] = m;
    const url = `https://${host}/.well-known/lnurlp/${encodeURIComponent(user!)}`;

    let res: Response;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      try {
        res = await fetch(url, { signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const err = e as Error;
      return {
        ok: false,
        reason: err.name === 'AbortError' ? 'TIMEOUT' : `FETCH_ERROR: ${err.message}`,
      };
    }

    if (!res.ok) {
      return { ok: false, reason: `HTTP_${res.status}` };
    }
    let json: any;
    try {
      json = await res.json();
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
