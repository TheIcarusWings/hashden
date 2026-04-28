// Group lifecycle REST endpoints.
//
// POST /hashden/groups
//   Operator publishes a kind-30078 group-metadata event via NIP-07,
//   then POSTs the signed event here. We verify the signature, parse
//   the content, and persist to Postgres. Operator RPC credentials are
//   accepted optionally; encryption-at-rest is a Week-9-launch followup.
//
// GET /hashden/groups
//   Public marketplace listing. Returns the safe subset of fields —
//   never operatorRpcAuth, never the encrypted blob.

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
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
  createdAt: Date;
}

@Controller('hashden/groups')
export class HashdenGroupsController {
  constructor(private readonly creds: OperatorCredsService) {}

  @Get()
  async list(): Promise<{ groups: PublicGroup[] }> {
    const rows = await prisma.group.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        slug: true,
        operatorPubkey: true,
        operatorBtcAddress: true,
        feeBps: true,
        payoutRule: true,
        templateSource: true,
        createdAt: true,
      },
    });

    // Pull the cached metadata content from Nostr-event JSON — but we
    // didn't store it on Group. For MVP, surface what we have; richer
    // {name, description} comes from a separate kind-30078 fetch on the
    // client. Slug is the user-facing identifier so this is fine.
    return {
      groups: rows.map((r) => ({
        slug: r.slug,
        name: r.slug,
        description: '',
        feeBps: r.feeBps,
        payoutRule: r.payoutRule,
        templateSource: r.templateSource,
        operatorPubkey: r.operatorPubkey,
        operatorBtcAddress: r.operatorBtcAddress,
        createdAt: r.createdAt,
      })),
    };
  }

  @Get(':slug')
  async show(@Param('slug') slug: string): Promise<PublicGroup> {
    const r = await prisma.group.findUnique({
      where: { slug },
      select: {
        slug: true,
        operatorPubkey: true,
        operatorBtcAddress: true,
        feeBps: true,
        payoutRule: true,
        templateSource: true,
        createdAt: true,
      },
    });
    if (!r) throw new HttpException('not found', HttpStatus.NOT_FOUND);
    return {
      slug: r.slug,
      name: r.slug,
      description: '',
      feeBps: r.feeBps,
      payoutRule: r.payoutRule,
      templateSource: r.templateSource,
      operatorPubkey: r.operatorPubkey,
      operatorBtcAddress: r.operatorBtcAddress,
      createdAt: r.createdAt,
    };
  }

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

    // Reject if a group with this slug already exists. Replacing-events
    // semantics for kind 30078 mean operators *can* update via Nostr,
    // but the platform's persisted row is a one-time create at MVP.
    const existing = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, operatorPubkey: true },
    });
    if (existing) {
      if (existing.operatorPubkey !== ev.pubkey) {
        throw new HttpException(
          'slug taken by another operator',
          HttpStatus.CONFLICT,
        );
      }
      // Same operator re-publishing — return the existing slug.
      return { slug };
    }

    // Encrypt operator credentials at rest if a master key is configured.
    // In dev without OPERATOR_CREDS_ENC_KEY, fall back to plaintext (with
    // a warning logged at OperatorCredsService construction).
    const encryptedRpcAuth = body.operatorRpcAuth
      ? this.creds.available
        ? this.creds.encrypt(body.operatorRpcAuth)
        : body.operatorRpcAuth
      : null;

    await prisma.group.create({
      data: {
        slug,
        operatorPubkey: ev.pubkey,
        operatorBtcAddress: content.operator_btc_address,
        feeBps: content.fee_bps,
        payoutRule: content.payout_rule,
        templateSource: content.template_source,
        operatorRpcUrl: body.operatorRpcUrl ?? null,
        operatorRpcAuth: encryptedRpcAuth,
      },
    });

    return { slug };
  }
}
