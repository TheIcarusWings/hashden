// PPLNS coinbase: weighted by recent shares.
//
// Algorithm:
//   1. Compute each member's weight = their_shares / total_shares.
//   2. Each member's would-be sats = floor(remainingSats * weight).
//   3. Members whose would-be sats < dustThreshold are bundled into the
//      operator-controlled DUST_BUCKET output. Operator fans the bucket
//      out via Lightning post-maturity using their own wallet (LNbits/NWC).
//   4. Above-dust members get their own coinbase output.
//   5. Operator fee + platform fee are separate outputs.
//   6. Any rounding remainder from floor() lands in the dust bucket
//      (or operator fee if no dust members) so total outputs equal
//      blockReward exactly.
//
// Determinism is critical: given identical inputs, the outputs must be
// identical bytewise — the same template will be served to all miners in
// the group during a given share window.

import type {
  CoinbaseOutput,
  DustBreakdownEntry,
  PplnsMember,
} from "@hashden/shared";
import { type FeeContext, splitFees } from "./fees.js";

// Re-export PplnsMember so callers importing buildPplnsCoinbase can also
// see the type they need to pass in.
export type { PplnsMember } from "@hashden/shared";

export interface PplnsInput extends FeeContext {
  /**
   * Members in the current share window, ordered deterministically by
   * memberPubkey ascending. Caller is responsible for stable ordering;
   * this builder asserts the input is already sorted to keep the function
   * pure (no sort side-effect on caller's array).
   */
  members: PplnsMember[];
  operatorBtcAddress: string;
  platformBtcAddress: string;
  /** Sats-amount threshold below which a member's payout rolls into the dust bucket. */
  dustThresholdSats: bigint;
}

export interface PplnsResult {
  outputs: CoinbaseOutput[];
  /**
   * If a DUST_BUCKET output exists, this lists the members owed and the
   * sats each is owed within that bucket. Operator's payouts worker uses
   * this to fan out via Lightning post-maturity.
   */
  dustBreakdown: DustBreakdownEntry[];
}

export function buildPplnsCoinbase(input: PplnsInput): PplnsResult {
  validatePplnsInput(input);

  const { operatorFeeSats, platformFeeSats, remainingSats } = splitFees(input);

  // Total share weight in the window.
  const totalWeight = input.members.reduce(
    (acc, m) => acc + m.shareWeight,
    0n,
  );
  if (totalWeight === 0n) {
    // Edge case: no shares in window. All "remaining" goes to the dust
    // bucket so the operator can deal with it (refund / hold / next-window).
    return finalizeWithoutMembers(input, {
      operatorFeeSats,
      platformFeeSats,
      remainingSats,
    });
  }

  // Compute per-member sats, splitting members into above- vs below-dust.
  const aboveDust: { member: PplnsMember; sats: bigint }[] = [];
  const dustBreakdown: DustBreakdownEntry[] = [];
  let dustBucketSats = 0n;
  let allocatedSats = 0n;

  for (const member of input.members) {
    const memberSats = (remainingSats * member.shareWeight) / totalWeight;
    if (memberSats >= input.dustThresholdSats) {
      aboveDust.push({ member, sats: memberSats });
      allocatedSats += memberSats;
    } else if (memberSats > 0n) {
      dustBucketSats += memberSats;
      dustBreakdown.push({
        memberPubkey: member.memberPubkey,
        owedSats: memberSats.toString(),
      });
      allocatedSats += memberSats;
    }
    // memberSats == 0 (not enough share weight to round to a sat) → ignored.
  }

  // Floor-rounding remainder lands in the dust bucket (or operator fee if none).
  const remainder = remainingSats - allocatedSats;
  let operatorFeeWithRemainder = operatorFeeSats;
  if (dustBreakdown.length > 0) {
    dustBucketSats += remainder;
  } else {
    operatorFeeWithRemainder += remainder;
  }

  const outputs: CoinbaseOutput[] = [];
  for (const { member, sats } of aboveDust) {
    outputs.push({
      address: member.btcAddress,
      sats: sats.toString(),
      kind: "MEMBER",
      memberPubkey: member.memberPubkey,
    });
  }
  if (dustBucketSats > 0n) {
    outputs.push({
      address: input.operatorBtcAddress,
      sats: dustBucketSats.toString(),
      kind: "DUST_BUCKET",
    });
  }
  if (operatorFeeWithRemainder > 0n) {
    outputs.push({
      address: input.operatorBtcAddress,
      sats: operatorFeeWithRemainder.toString(),
      kind: "OPERATOR_FEE",
    });
  }
  if (platformFeeSats > 0n) {
    outputs.push({
      address: input.platformBtcAddress,
      sats: platformFeeSats.toString(),
      kind: "PLATFORM_FEE",
    });
  }
  return { outputs, dustBreakdown };
}

function finalizeWithoutMembers(
  input: PplnsInput,
  fees: { operatorFeeSats: bigint; platformFeeSats: bigint; remainingSats: bigint },
): PplnsResult {
  const outputs: CoinbaseOutput[] = [];
  if (fees.remainingSats > 0n) {
    outputs.push({
      address: input.operatorBtcAddress,
      sats: fees.remainingSats.toString(),
      kind: "DUST_BUCKET",
    });
  }
  if (fees.operatorFeeSats > 0n) {
    outputs.push({
      address: input.operatorBtcAddress,
      sats: fees.operatorFeeSats.toString(),
      kind: "OPERATOR_FEE",
    });
  }
  if (fees.platformFeeSats > 0n) {
    outputs.push({
      address: input.platformBtcAddress,
      sats: fees.platformFeeSats.toString(),
      kind: "PLATFORM_FEE",
    });
  }
  return { outputs, dustBreakdown: [] };
}

function validatePplnsInput(input: PplnsInput): void {
  if (!input.operatorBtcAddress) throw new Error("operatorBtcAddress required");
  if (!input.platformBtcAddress) throw new Error("platformBtcAddress required");
  if (input.dustThresholdSats < 0n) {
    throw new Error("dustThresholdSats must be non-negative");
  }
  // Stable order check: members must be sorted by memberPubkey ascending.
  for (let i = 1; i < input.members.length; i++) {
    if (input.members[i - 1]!.memberPubkey >= input.members[i]!.memberPubkey) {
      throw new Error(
        `members must be sorted ascending by memberPubkey (violation at index ${i})`,
      );
    }
  }
  for (const m of input.members) {
    if (m.shareWeight < 0n) {
      throw new Error(
        `shareWeight must be non-negative (member ${m.memberPubkey})`,
      );
    }
    if (!m.btcAddress) {
      throw new Error(`btcAddress required (member ${m.memberPubkey})`);
    }
  }
}
