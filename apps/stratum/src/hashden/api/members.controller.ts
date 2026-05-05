// Member registration endpoint.
//
// POST /hashden/groups/:slug/members
//   Body: { signedEvent }  — kind-30078 with d-tag = slug, content =
//     { btc_address, lightning_address }, signed by member's NIP-07.
//   Verifies the signature, validates addresses, persists to Member.
//
// We use a kind-30078 application-data event (different `d`-tag space)
// rather than inventing a new kind so member registrations are also
// publishable to relays (NIP-33 replaceable: re-publishing replaces the
// previous registration). At MVP we just persist to Postgres; broadcast
// is a follow-up.

import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { prisma } from '@hashden/db';
import { verifyEvent } from 'nostr-tools';
import { validate as validateBitcoinAddress } from 'bitcoin-address-validation';

interface JoinBody {
  signedEvent: {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}

interface MemberContent {
  btc_address: string;
  lightning_address: string;
}

@Controller('hashden/groups/:slug/members')
export class HashdenMembersController {
  // Member registration is upsert-by-(group, pubkey), so re-running with
  // the same pubkey doesn't blow up the table. But spam with fresh
  // pubkeys would. 10/hour per IP balances this — a real miner joining
  // multiple groups from the same machine still works.
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  async join(
    @Param('slug') slug: string,
    @Body() body: JoinBody,
  ): Promise<{ ok: true; memberPubkey: string }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }

    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;
    if (ev.kind !== 30078) {
      throw new HttpException('expected kind 30078', HttpStatus.BAD_REQUEST);
    }
    let valid = false;
    try {
      valid = verifyEvent(ev as any);
    } catch (e) {
      throw new HttpException(
        `signature verification failed: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!valid) {
      throw new HttpException('invalid signature', HttpStatus.BAD_REQUEST);
    }

    // d-tag must match the group slug to bind the registration to this group.
    const dTag = ev.tags.find((t) => t[0] === 'd');
    if (!dTag || dTag[1] !== `member:${slug}`) {
      throw new HttpException(
        `d-tag must be "member:${slug}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let content: MemberContent;
    try {
      content = JSON.parse(ev.content);
    } catch {
      throw new HttpException('content is not valid JSON', HttpStatus.BAD_REQUEST);
    }
    if (
      !content ||
      typeof content.btc_address !== 'string' ||
      typeof content.lightning_address !== 'string'
    ) {
      throw new HttpException(
        'content must have { btc_address, lightning_address } strings',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!validateBitcoinAddress(content.btc_address)) {
      throw new HttpException(
        `invalid btc_address: ${content.btc_address}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    // Lightning address validation: simple format check (user@host).
    // LNURL probe is a follow-up (would require a network call to verify
    // the host actually serves a valid LNURL-pay response).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.lightning_address)) {
      throw new HttpException(
        `invalid lightning_address format: ${content.lightning_address}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await prisma.member.upsert({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: ev.pubkey,
        },
      },
      create: {
        groupId: group.id,
        memberPubkey: ev.pubkey,
        btcAddress: content.btc_address,
        lightningAddress: content.lightning_address,
      },
      update: {
        btcAddress: content.btc_address,
        lightningAddress: content.lightning_address,
      },
    });

    return { ok: true, memberPubkey: ev.pubkey };
  }
}
