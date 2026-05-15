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
      /** BTC address registered for this member; the stratum's auth handler
       * substitutes this for the validator that expects a Bitcoin address. */
      btcAddress: string;
      workerId: string | null;
    }
  | {
      ok: false;
      reason: "INVALID_NAME" | "GROUP_NOT_FOUND" | "GROUP_DELETED" | "NOT_MEMBER";
      detail?: WorkerNameError | string;
    };

// Structural type matching the methods on PrismaClient that we use. Real
// PrismaClient satisfies this; tests can pass a hand-rolled object.
export interface PrismaLike {
  group: {
    findUnique(args: {
      where: { slug: string };
      select: { id: true; visibility: true };
    }): Promise<{ id: string; visibility: string } | null>;
  };
  member: {
    findUnique(args: {
      where: { groupId_memberPubkey: { groupId: string; memberPubkey: string } };
      select: { groupId: true; btcAddress: true };
    }): Promise<{ groupId: string; btcAddress: string } | null>;
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
      select: { id: true, visibility: true },
    });
    if (!group) return { ok: false, reason: "GROUP_NOT_FOUND" };
    // Deleted dens reject incoming shares — historical rows stay but no
    // new work gets recorded against this group.
    if (group.visibility === "DELETED") {
      return { ok: false, reason: "GROUP_DELETED" };
    }

    const member = await this.prisma.member.findUnique({
      where: {
        groupId_memberPubkey: {
          groupId: group.id,
          memberPubkey: parsed.memberPubkey,
        },
      },
      select: { groupId: true, btcAddress: true },
    });
    if (!member) return { ok: false, reason: "NOT_MEMBER" };

    return {
      ok: true,
      groupId: group.id,
      memberPubkey: parsed.memberPubkey,
      btcAddress: member.btcAddress,
      workerId: parsed.workerId,
    };
  }
}
