// Fee math primitives shared by both payout rules.
//
// All amounts are bigint sats. Basis points (bps) range 0..10000 (10000 = 100%).
// Fee math floors — any rounding remainder accumulates and goes to the
// recipient who is responsible for it (operator absorbs the slack so the
// platform fee remains exactly the configured percentage).

export interface FeeSplit {
  operatorFeeSats: bigint;
  platformFeeSats: bigint;
  remainingSats: bigint; // what's left for member outputs
}

export interface FeeContext {
  blockRewardSats: bigint;
  operatorFeeBps: number;
  platformFeeBps: number;
}

export function validateFees(ctx: FeeContext): void {
  if (ctx.blockRewardSats <= 0n) {
    throw new Error("blockRewardSats must be positive");
  }
  if (
    !Number.isInteger(ctx.operatorFeeBps) ||
    ctx.operatorFeeBps < 0 ||
    ctx.operatorFeeBps > 10_000
  ) {
    throw new Error("operatorFeeBps must be integer 0..10000");
  }
  if (
    !Number.isInteger(ctx.platformFeeBps) ||
    ctx.platformFeeBps < 0 ||
    ctx.platformFeeBps > 10_000
  ) {
    throw new Error("platformFeeBps must be integer 0..10000");
  }
  if (ctx.operatorFeeBps + ctx.platformFeeBps > 10_000) {
    throw new Error(
      "operatorFeeBps + platformFeeBps cannot exceed 10000 (100%)",
    );
  }
}

export function splitFees(ctx: FeeContext): FeeSplit {
  validateFees(ctx);
  const platformFeeSats =
    (ctx.blockRewardSats * BigInt(ctx.platformFeeBps)) / 10_000n;
  const operatorFeeSats =
    (ctx.blockRewardSats * BigInt(ctx.operatorFeeBps)) / 10_000n;
  const remainingSats = ctx.blockRewardSats - platformFeeSats - operatorFeeSats;
  return { operatorFeeSats, platformFeeSats, remainingSats };
}
