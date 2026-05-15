// Group lifecycle REST endpoints.
//
// POST /hashden/groups
//   Operator publishes a kind-30078 group-metadata event via NIP-07,
//   then POSTs the signed event here. We verify the signature, parse
//   the content, and persist to Postgres. Operator RPC credentials are
//   accepted optionally; encryption-at-rest is a Week-9-launch followup.
//
// GET /hashden/groups
//   Public marketplace listing (visibility = PUBLIC only). Returns the
//   safe subset of fields. Never operatorRpcAuth, never the encrypted
//   blob.
//
// GET /hashden/groups/by/:pubkey
//   All dens a pubkey is associated with as either operator or member,
//   regardless of visibility. Used by /me to render the dashboard so
//   UNLISTED dens still appear for the people who belong to them.

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { prisma } from '@hashden/db';
import {
  parseGroupMetadataContent,
  type GroupMetadataContent,
} from '@hashden/nostr';
// nostr-tools top-level export works under stratum's CommonJS resolution.
// Subpath imports like 'nostr-tools/pure' don't resolve here; plain
// 'nostr-tools' re-exports verifyEvent from pure.
import { verifyEvent } from 'nostr-tools';
import { OperatorCredsService } from '../operator-creds.service';

interface CreateGroupBody {
  signedEvent: {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
    sig: string;
  };
  /** Required only when content.template_source === "OPERATOR_RPC". */
  operatorRpcUrl?: string;
  /** Required only when content.template_source === "OPERATOR_RPC".
   *  Stored as-is at MVP; encrypt-at-rest is a Week-9 followup. */
  operatorRpcAuth?: string;
}

interface PublicGroup {
  slug: string;
  name: string;
  description: string;
  feeBps: number;
  payoutRule: string;
  templateSource: string;
  operatorPubkey: string;
  operatorBtcAddress: string;
  visibility: string;
  createdAt: Date;
}

const GROUP_SELECT = {
  slug: true,
  operatorPubkey: true,
  operatorBtcAddress: true,
  feeBps: true,
  payoutRule: true,
  templateSource: true,
  visibility: true,
  createdAt: true,
} as const;

interface GroupRow {
  slug: string;
  operatorPubkey: string;
  operatorBtcAddress: string;
  feeBps: number;
  payoutRule: string;
  templateSource: string;
  visibility: string;
  createdAt: Date;
}

function toPublicGroup(r: GroupRow): PublicGroup {
  return {
    slug: r.slug,
    // {name, description} are not persisted on Group at MVP — clients
    // fall back to the slug (or fetch the kind-30078 event for richer
    // metadata). Same shape across all endpoints.
    name: r.slug,
    description: '',
    feeBps: r.feeBps,
    payoutRule: r.payoutRule,
    templateSource: r.templateSource,
    operatorPubkey: r.operatorPubkey,
    operatorBtcAddress: r.operatorBtcAddress,
    visibility: r.visibility,
    createdAt: r.createdAt,
  };
}

@Controller('hashden/groups')
export class HashdenGroupsController {
  constructor(private readonly creds: OperatorCredsService) {}

  @Get()
  async list(): Promise<{ groups: PublicGroup[] }> {
    const rows = await prisma.group.findMany({
      where: { visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: GROUP_SELECT,
    });
    return { groups: rows.map(toPublicGroup) };
  }

  // Dens this pubkey operates OR is a member of, regardless of visibility.
  // Used by /me so UNLISTED dens still show up for people who belong to
  // them. Pubkey is the only "auth" here at MVP; anyone can ask "what
  // dens does pubkey X belong to" since membership is already public on
  // Nostr. The endpoint never reveals operator credentials or per-member
  // BTC/LN addresses.
  @Get('by/:pubkey')
  async listForPubkey(
    @Param('pubkey') pubkey: string,
  ): Promise<{ groups: PublicGroup[] }> {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new HttpException(
        'pubkey must be 64 hex chars',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows = await prisma.group.findMany({
      where: {
        OR: [
          { operatorPubkey: pubkey },
          { members: { some: { memberPubkey: pubkey } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: GROUP_SELECT,
    });
    return { groups: rows.map(toPublicGroup) };
  }

  @Get(':slug')
  async show(@Param('slug') slug: string): Promise<PublicGroup> {
    const r = await prisma.group.findUnique({
      where: { slug },
      select: GROUP_SELECT,
    });
    if (!r) throw new HttpException('not found', HttpStatus.NOT_FOUND);
    return toPublicGroup(r);
  }

  // Group creation is the most-abusable endpoint: each call writes a row
  // after sig verification, but generating fresh nostr keypairs is cheap.
  // 5 creates/hour per IP kills bot spam without bothering legitimate use
  // (no human creates 5 groups in an hour).
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  async create(@Body() body: CreateGroupBody): Promise<{ slug: string }> {
    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;

    if (ev.kind !== 30078) {
      throw new HttpException(
        `expected kind 30078, got ${ev.kind}`,
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

    // Pull slug from the d-tag.
    const dTag = ev.tags.find((t) => t[0] === 'd');
    const slug = dTag?.[1];
    if (!slug || typeof slug !== 'string') {
      throw new HttpException('missing d-tag (slug)', HttpStatus.BAD_REQUEST);
    }

    // Parse content.
    const parsed = parseGroupMetadataContent(ev.content);
    if (!parsed.ok) {
      // Cast handles the upstream tsconfig's strictNullChecks=false where
      // discriminated-union narrowing doesn't fully kick in.
      const failed = parsed as Extract<typeof parsed, { ok: false }>;
      throw new HttpException(
        `invalid metadata content: ${failed.reason}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const content: GroupMetadataContent = (parsed as Extract<typeof parsed, { ok: true }>).content;

    // Operator-RPC consistency: if content claims OPERATOR_RPC, body
    // must include url + auth. Stored as-is at MVP.
    if (content.template_source === 'OPERATOR_RPC') {
      if (!body.operatorRpcUrl || !body.operatorRpcAuth) {
        throw new HttpException(
          'OPERATOR_RPC groups require operatorRpcUrl and operatorRpcAuth',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Encrypt operator credentials at rest if a master key is configured.
    // In dev without OPERATOR_CREDS_ENC_KEY, fall back to plaintext (with
    // a warning logged at OperatorCredsService construction).
    const encryptedRpcAuth = body.operatorRpcAuth
      ? this.creds.available
        ? this.creds.encrypt(body.operatorRpcAuth)
        : body.operatorRpcAuth
      : null;

    // Same-operator re-publishing UPDATES the row; cross-operator slug
    // collision is a 409. Mirrors NIP-33 replaceable-event semantics on
    // the platform-cache side.
    const existing = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, operatorPubkey: true },
    });
    const visibility = content.visibility ?? 'PUBLIC';

    if (existing) {
      if (existing.operatorPubkey !== ev.pubkey) {
        throw new HttpException(
          'slug taken by another operator',
          HttpStatus.CONFLICT,
        );
      }
      await prisma.group.update({
        where: { slug },
        data: {
          operatorBtcAddress: content.operator_btc_address,
          feeBps: content.fee_bps,
          payoutRule: content.payout_rule,
          templateSource: content.template_source,
          visibility,
          operatorRpcUrl: body.operatorRpcUrl ?? null,
          // Only overwrite the encrypted auth if a new one was provided;
          // omitting it on update means "keep the existing one".
          ...(body.operatorRpcAuth
            ? { operatorRpcAuth: encryptedRpcAuth }
            : {}),
        },
      });
      return { slug };
    }

    await prisma.group.create({
      data: {
        slug,
        operatorPubkey: ev.pubkey,
        operatorBtcAddress: content.operator_btc_address,
        feeBps: content.fee_bps,
        payoutRule: content.payout_rule,
        templateSource: content.template_source,
        visibility,
        operatorRpcUrl: body.operatorRpcUrl ?? null,
        operatorRpcAuth: encryptedRpcAuth,
      },
    });

    return { slug };
  }
}
