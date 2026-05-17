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
  parseAddressableTag,
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
  // Only populated by /by/:pubkey when the queried pubkey is a member
  // (not operator) of this den. null otherwise. Lets /me render the
  // "Show my npub publicly" toggle with the right initial value.
  memberShowPubkey?: boolean | null;
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

function toPublicGroup(
  r: GroupRow,
  memberShowPubkey: boolean | null = null,
): PublicGroup {
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
    memberShowPubkey,
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
    return { groups: rows.map((r) => toPublicGroup(r)) };
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
        // Even an operator/member shouldn't see DELETED dens in the
        // dashboard; the row stays for payout audit but is not surfaced.
        visibility: { not: 'DELETED' },
        OR: [
          { operatorPubkey: pubkey },
          { members: { some: { memberPubkey: pubkey } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      // We need the internal id to join against Member; we never expose
      // it in the response (toPublicGroup picks fields explicitly).
      select: { ...GROUP_SELECT, id: true },
    });

    // Annotate each row with the requesting pubkey's per-den display
    // preference so /me can render the "Show my npub publicly" toggle
    // with the right initial state. Operator rows get null.
    const memberRows = await prisma.member.findMany({
      where: {
        memberPubkey: pubkey,
        groupId: { in: rows.map((r) => r.id) },
      },
      select: { groupId: true, showPubkey: true },
    });
    const showMap = new Map(memberRows.map((m) => [m.groupId, m.showPubkey]));

    return {
      groups: rows.map((r) =>
        toPublicGroup(r, showMap.has(r.id) ? showMap.get(r.id)! : null),
      ),
    };
  }

  @Get(':slug')
  async show(@Param('slug') slug: string): Promise<PublicGroup> {
    const r = await prisma.group.findUnique({
      where: { slug },
      select: GROUP_SELECT,
    });
    if (!r) throw new HttpException('not found', HttpStatus.NOT_FOUND);
    // Deleted dens are gone from a public-facing API perspective.
    // 410 Gone signals the resource existed but is intentionally retired,
    // so clients don't retry as they would on a transient 404.
    if (r.visibility === 'DELETED') {
      throw new HttpException('den deleted', HttpStatus.GONE);
    }
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
      select: { id: true, operatorPubkey: true, visibility: true },
    });
    const visibility = content.visibility ?? 'PUBLIC';

    if (existing) {
      if (existing.operatorPubkey !== ev.pubkey) {
        throw new HttpException(
          'slug taken by another operator',
          HttpStatus.CONFLICT,
        );
      }
      // Deleted dens are tombstones. If an operator wants the slug back
      // after deleting, they must pick a new slug — keeps payout history
      // unambiguously associated with the original den row.
      if (existing.visibility === 'DELETED') {
        throw new HttpException(
          'slug previously used for a deleted den; pick another',
          HttpStatus.GONE,
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

  // Soft-delete: operator signs a NIP-09 kind-5 deletion event addressing
  // the den's kind-30078 metadata via an `a` tag (NIP-33 addressable form).
  // We verify the signature, confirm the signer is the operator, and flip
  // `visibility` to DELETED. Historical share/block/payout rows are kept
  // so post-deletion audits still work; the den just becomes invisible to
  // listings and refuses new members + shares.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':slug/delete')
  async delete(
    @Param('slug') slug: string,
    @Body() body: { signedEvent: CreateGroupBody['signedEvent'] },
  ): Promise<{ slug: string; visibility: 'DELETED' }> {
    if (!body || !body.signedEvent) {
      throw new HttpException('signedEvent required', HttpStatus.BAD_REQUEST);
    }
    const ev = body.signedEvent;

    if (ev.kind !== 5) {
      throw new HttpException(
        `expected kind 5 (NIP-09), got ${ev.kind}`,
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

    // Replay protection: deletions must be fresh. ±5 min window covers
    // clock skew without leaving a wide replay surface.
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ev.created_at) > 300) {
      throw new HttpException(
        'event created_at out of window (must be within ±5 min of server time)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Parse the `a` tag and confirm it addresses *this* den.
    const aTag = ev.tags.find((t) => t[0] === 'a');
    if (!aTag) {
      throw new HttpException(
        'missing `a` tag referencing the den (format `30078:<pubkey>:<slug>`)',
        HttpStatus.BAD_REQUEST,
      );
    }
    const target = parseAddressableTag(aTag[1]);
    if (!target.ok) {
      // Cast: stratum's tsconfig has strictNullChecks off, so the union
      // doesn't auto-narrow on `!target.ok`. Same pattern as create().
      const failed = target as Extract<typeof target, { ok: false }>;
      throw new HttpException(
        `malformed \`a\` tag: ${failed.reason}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const ok = target as Extract<typeof target, { ok: true }>;
    if (ok.kind !== 30078) {
      throw new HttpException(
        `\`a\` tag must address kind 30078, got ${ok.kind}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (ok.slug !== slug) {
      throw new HttpException(
        `\`a\` tag slug (${ok.slug}) does not match path slug (${slug})`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (ok.operatorPubkey !== ev.pubkey) {
      throw new HttpException(
        '`a` tag pubkey must match the signer',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await prisma.group.findUnique({
      where: { slug },
      select: { id: true, operatorPubkey: true, visibility: true },
    });
    if (!existing) {
      throw new HttpException('not found', HttpStatus.NOT_FOUND);
    }
    if (existing.operatorPubkey !== ev.pubkey) {
      throw new HttpException(
        'only the operator can delete this den',
        HttpStatus.FORBIDDEN,
      );
    }

    // Idempotent: deleting a DELETED den just returns success.
    if (existing.visibility !== 'DELETED') {
      await prisma.group.update({
        where: { slug },
        data: { visibility: 'DELETED' },
      });
    }

    return { slug, visibility: 'DELETED' };
  }
}
