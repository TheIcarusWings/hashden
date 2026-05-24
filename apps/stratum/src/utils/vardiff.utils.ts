import { ConfigService } from '@nestjs/config';

// Vardiff (variable-difficulty) tuning. Each connection's share-difficulty
// target is re-evaluated once a minute (StratumV1Client.checkDifficulty) and
// nudged toward roughly one accepted share every TARGET_SECONDS_PER_SHARE
// seconds. These helpers keep the knobs configurable and the defaults in one
// place — same single-source-of-truth pattern as extranonce.utils.ts.

/**
 * Target spacing between accepted shares, in seconds. Despite the historical
 * upstream name `TARGET_SUBMISSION_PER_SECOND`, the math targets one share per
 * this many seconds (a larger value = fewer, harder shares). 10s matches
 * upstream public-pool. Override per deployment with
 * VARDIFF_TARGET_SECONDS_PER_SHARE.
 */
export const DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE = 10;

/** Resolve the configured vardiff target spacing (seconds), guarded > 0. */
export function getVardiffTargetSecondsPerShare(configService: ConfigService): number {
  const raw = parseFloat(configService.get('VARDIFF_TARGET_SECONDS_PER_SHARE'));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE;
  return raw;
}

/**
 * Grace window (ms) after a difficulty *increase* during which shares that only
 * clear the previous (lower) target are still accepted instead of being
 * rejected as "Difficulty too low".
 *
 * Why this matters: after the server raises a connection's difficulty it sends
 * mining.set_difficulty, but the miner needs a moment to apply it — and that lag
 * is worse behind a hashrate-marketplace fan-out proxy (Braiins, NiceHash),
 * which presents one upstream session for many rigs. Every in-flight share at
 * the old difficulty would otherwise be a reject, and a high reject ratio is
 * exactly what trips marketplace order-cancellation / target-blacklist
 * thresholds. Shares accepted during the grace window are credited at the
 * difficulty they actually clear (see StratumV1Client.acceptableTarget), so the
 * PPLNS weighting stays honest and non-custodial payout math is unaffected.
 */
export const DEFAULT_VARDIFF_GRACE_MS = 30000;

/** Resolve the configured vardiff grace window (ms), guarded >= 0. */
export function getVardiffGraceMs(configService: ConfigService): number {
  const raw = parseInt(configService.get('VARDIFF_GRACE_MS'), 10);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_VARDIFF_GRACE_MS;
  return raw;
}
