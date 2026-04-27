// GroupRouter — turns a stratum worker username into a routing decision.
//
// Combines @hashden/shared/worker-name parsing with a DB lookup against
// @hashden/db to confirm (a) the group exists by slug, (b) the member's
// pubkey is registered in that group. On success, returns the resolved
// group id + member pubkey ready for the share-write path.
//
// Pure dependency on a Prisma-shaped client interface (PrismaLike below)
// so callers can pass a real PrismaClient or a hand-rolled stub for tests.

import { parseWorkerName, type WorkerNameError } from "@hashden/shared";

export type RouteDecision =
  | {
      ok: true;
      groupId: string;
      memberPubkey: string;
      workerId: string | null;
    }
  | {
      ok: false;
      reason: "INVALID_NAME" | "GROUP_NOT_FOUND" | "NOT_MEMBER";
      detail?: WorkerNameError | string;
    };

// Structural type matching the methods on PrismaClient that we use. Real
// PrismaClient satisfies this; tests can pass a hand-rolled object.
export interface PrismaLike {
  group: {
    findUnique(args: {
      where: { slug: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  member: {
    findUnique(args: {
      where: { groupId_memberPubkey: { groupId: string; memberPubkey: string } };
      select: { groupId: true };
    }): Promise<{ groupId: string } | null>;
  };
}

export class GroupRouter {
  constructor(private readonly prisma: PrismaLike) {}

  async route(workerName: unknown): Promise<RouteDecision> {
    const parsed = parseWorkerName(workerName);
    if (!parsed.ok) {
      // Cast handles consumers compiled with strictNullChecks=false where
      // discriminated-union narrowing doesn't fully apply (e.g. the upstream
      // public-pool fork's tsconfig). The runtime shape is guaranteed by
      // parseWorkerName's contract.
      const failed = parsed as Extract<typeof parsed, { ok: false }>;
      return { ok: false, reason: "INVALID_NAME", detail: failed.reason };
    }

    const group = await this.prisma.group.findUnique({
      where: { slug: parsed.slug },
      select: { id: true },
    });
    if (!group) return { ok: false, reason: "GROUP_NOT_FOUND" };

    const member = await this.prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: parsed.memberPubkey,
        },
      },
      select: { groupId: true },
    });
    if (!member) return { ok: false, reason: "NOT_MEMBER" };

    return {
      ok: true,
      groupId: group.id,
      memberPubkey: parsed.memberPubkey,
      workerId: parsed.workerId,
    };
  }
}
