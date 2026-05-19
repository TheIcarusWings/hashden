import { ConfigService } from '@nestjs/config';

// Single source of truth for the stratum extranonce split. The size advertised
// to miners in mining.subscribe (SubscriptionMessage) and the byte region
// reserved in the coinbase scriptSig (MiningJob) MUST agree, or miners produce
// coinbases of the wrong length and every share/block is invalid — so both read
// these helpers rather than hardcoding a literal.

/** Per-connection extranonce1 = the random clientId, fixed at 4 bytes (8 hex). */
export const EXTRANONCE1_SIZE_BYTES = 4;

/**
 * Default extranonce2 size in bytes. 8 satisfies hashrate marketplaces
 * (Braiins requires >= 7, NiceHash >= 8) while keeping the coinbase scriptSig
 * (extranonce1 + extranonce2 + height + pool identifier) well under the 100-byte
 * consensus limit. Solo miners (Bitaxe etc.) honor the advertised size too.
 * Override per deployment with the EXTRANONCE2_SIZE env var (set 4 to restore
 * the historical upstream public-pool behavior).
 */
export const DEFAULT_EXTRANONCE2_SIZE_BYTES = 8;

/** Resolve the configured extranonce2 size (bytes), clamped to a sane range. */
export function getExtranonce2SizeBytes(configService: ConfigService): number {
  const raw = parseInt(configService.get('EXTRANONCE2_SIZE'), 10);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_EXTRANONCE2_SIZE_BYTES;
  // Upper bound keeps extranonce1+extranonce2 (+height+poolId) inside the
  // 100-byte scriptSig limit; 16 bytes of extranonce2 is already far beyond
  // anything a marketplace asks for.
  return Math.min(raw, 16);
}

/**
 * Total extranonce region (extranonce1 + extranonce2) length in hex chars —
 * the gap reserved between coinbasePart1 and coinbasePart2 that the miner fills
 * with extranonce1 + extranonce2.
 */
export function extranonceRegionHexLen(extranonce2SizeBytes: number): number {
  return (EXTRANONCE1_SIZE_BYTES + extranonce2SizeBytes) * 2;
}
