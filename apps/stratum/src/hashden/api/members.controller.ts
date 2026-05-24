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
  // Optional at join time. Defaults to false (anonymized in read endpoints)
  // when absent. Members can flip this later via /preferences without
  // re-submitting BTC/LN addresses.
  show_pubkey?: boolean;
}

interface PreferencesContent {
  show_pubkey: boolean;
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
      select: { id: true, visibility: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }
    if (group.visibility === 'DELETED') {
      throw new HttpException(
        `den ${slug} has been deleted by its operator`,
        HttpStatus.GONE,
      );
    }

    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;
    if (ev.kind !== 30078) {
      throw new HttpException('expected kind 30078', HttpStatus.BAD_REQUEST);
    }

    // Replay protection: join events must be fresh. Nostr events are public,
    // so without a freshness window an attacker could replay a member's OLD
    // join event after they rotate wallets, rolling btc_address back to the
    // abandoned (possibly compromised) address and redirecting future block
    // rewards there. Same ±5 min window as setPreferences/myRecord/delete.
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ev.created_at) > 300) {
      throw new HttpException(
        'event created_at out of window (±5 min)',
        HttpStatus.BAD_REQUEST,
      );
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

    // show_pubkey defaults to false (anonymize) unless the join event
    // explicitly sets it true. On UPSERT we preserve the previous value
    // for existing rows when the field is absent — re-registering to
    // update an address shouldn't silently flip a user back to private.
    const showPubkeyOnCreate =
      typeof content.show_pubkey === 'boolean' ? content.show_pubkey : false;
    const showPubkeyOnUpdate =
      typeof content.show_pubkey === 'boolean'
        ? { showPubkey: content.show_pubkey }
        : {};

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
        showPubkey: showPubkeyOnCreate,
      },
      update: {
        btcAddress: content.btc_address,
        lightningAddress: content.lightning_address,
        ...showPubkeyOnUpdate,
      },
    });

    return { ok: true, memberPubkey: ev.pubkey };
  }

  // Update display preferences without re-submitting addresses.
  // Body: { signedEvent } — kind 30078, d-tag `member-prefs:<slug>`,
  // content `{ show_pubkey: boolean }`. Signer's pubkey is the member.
  // 404 if the member doesn't already exist for this den (must join first).
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('preferences')
  async setPreferences(
    @Param('slug') slug: string,
    @Body() body: JoinBody,
  ): Promise<{ ok: true; memberPubkey: string; showPubkey: boolean }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, visibility: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }
    if (group.visibility === 'DELETED') {
      throw new HttpException(
        `den ${slug} has been deleted by its operator`,
        HttpStatus.GONE,
      );
    }

    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;
    if (ev.kind !== 30078) {
      throw new HttpException('expected kind 30078', HttpStatus.BAD_REQUEST);
    }

    // Replay protection: prefs events must be fresh.
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ev.created_at) > 300) {
      throw new HttpException(
        'event created_at out of window (±5 min)',
        HttpStatus.BAD_REQUEST,
      );
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

    const dTag = ev.tags.find((t) => t[0] === 'd');
    if (!dTag || dTag[1] !== `member-prefs:${slug}`) {
      throw new HttpException(
        `d-tag must be "member-prefs:${slug}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let content: PreferencesContent;
    try {
      content = JSON.parse(ev.content);
    } catch {
      throw new HttpException('content is not valid JSON', HttpStatus.BAD_REQUEST);
    }
    if (typeof content.show_pubkey !== 'boolean') {
      throw new HttpException(
        'content must have { show_pubkey: boolean }',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Existing membership required. We don't auto-create from a prefs
    // event because we'd be missing the BTC/LN addresses that registration
    // collects.
    const existing = await prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: ev.pubkey,
        },
      },
      select: { memberPubkey: true },
    });
    if (!existing) {
      throw new HttpException(
        'not a member of this den; join first',
        HttpStatus.NOT_FOUND,
      );
    }

    await prisma.member.update({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: ev.pubkey,
        },
      },
      data: { showPubkey: content.show_pubkey },
    });

    return {
      ok: true,
      memberPubkey: ev.pubkey,
      showPubkey: content.show_pubkey,
    };
  }

  // Authenticated read: returns the CALLER'S OWN member record (private payout
  // addresses) so the "manage payout" form can pre-fill instead of forcing a
  // re-type. Ownership is proven by a fresh, signed kind-30078 with d-tag
  // `member-record:<slug>` — never returns another member's addresses, and the
  // distinct d-tag means a record-fetch can't be replayed as a write.
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @Post('record')
  async myRecord(
    @Param('slug') slug: string,
    @Body() body: JoinBody,
  ): Promise<{
    btcAddress: string;
    lightningAddress: string;
    showPubkey: boolean;
  }> {
    const group = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, visibility: true },
    });
    if (!group) {
      throw new HttpException(`group ${slug} not found`, HttpStatus.NOT_FOUND);
    }
    if (group.visibility === 'DELETED') {
      throw new HttpException(
        `den ${slug} has been deleted by its operator`,
        HttpStatus.GONE,
      );
    }

    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;
    if (ev.kind !== 30078) {
      throw new HttpException('expected kind 30078', HttpStatus.BAD_REQUEST);
    }

    // Replay protection: the proof must be fresh.
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ev.created_at) > 300) {
      throw new HttpException(
        'event created_at out of window (±5 min)',
        HttpStatus.BAD_REQUEST,
      );
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

    const dTag = ev.tags.find((t) => t[0] === 'd');
    if (!dTag || dTag[1] !== `member-record:${slug}`) {
      throw new HttpException(
        `d-tag must be "member-record:${slug}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const member = await prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: ev.pubkey,
        },
      },
      select: { btcAddress: true, lightningAddress: true, showPubkey: true },
    });
    if (!member) {
      throw new HttpException(
        'not a member of this den; join first',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      btcAddress: member.btcAddress,
      lightningAddress: member.lightningAddress,
      showPubkey: member.showPubkey,
    };
  }
}
