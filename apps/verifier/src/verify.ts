// The trust-critical check: does this coinbase pay MY address?
//
// The miner supplies their own payout address (they registered it, so they know
// it) — so verification needs nothing from the server. We encode that address to
// a scriptPubKey with the SAME call packages/coinbase uses
// (bitcoin.address.toOutputScript), so the bytes match the den's coinbase output
// by construction, then look for it among the parsed outputs.

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import type { CoinbaseOutputParsed } from "./coinbase.js";

// Needed for P2TR (taproot/bech32m) address parsing. Idempotent.
bitcoin.initEccLib(ecc);

export type PayoutRule = "SOLO_SHOWCASE" | "PPLNS";

export type Network = "mainnet" | "testnet" | "regtest" | "signet";

export interface VerifyConfig {
  /** The miner's own payout address — the thing being checked for. */
  myAddress: string;
  payoutRule: PayoutRule;
  /** SOLO only: minimum fraction (0..1) of the reward my address must receive. */
  minRewardShare: number;
  /** PPLNS only: minimum sats my address must receive (default 1 = "present"). */
  minSats?: bigint;
  network: Network;
}

export interface VerifyResult {
  ok: boolean;
  mySats: bigint;
  totalSats: bigint;
  /** mySats / totalSats, 0..1. */
  sharePct: number;
  myOutputCount: number;
  outputCount: number;
  reason: string;
}

const NETWORKS: Record<Network, bitcoin.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  regtest: bitcoin.networks.regtest,
  signet: bitcoin.networks.testnet, // signet shares testnet address prefixes
};

export function addressToScript(address: string, network: Network): Uint8Array {
  try {
    return new Uint8Array(
      bitcoin.address.toOutputScript(address, NETWORKS[network]),
    );
  } catch (err) {
    throw new Error(
      `Invalid ${network} address "${address}": ${(err as Error).message}`,
    );
  }
}

function scriptsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Check that the coinbase outputs pay the configured address adequately.
 * Pure function — no I/O, no server trust.
 */
export function verifyOutputs(
  outputs: CoinbaseOutputParsed[],
  cfg: VerifyConfig,
): VerifyResult {
  const myScript = addressToScript(cfg.myAddress, cfg.network);

  let mySats = 0n;
  let totalSats = 0n;
  let myOutputCount = 0;
  for (const out of outputs) {
    totalSats += out.valueSats;
    if (scriptsEqual(out.scriptPubKey, myScript)) {
      mySats += out.valueSats;
      myOutputCount++;
    }
  }
  const sharePct = totalSats > 0n ? Number(mySats) / Number(totalSats) : 0;
  const base = {
    mySats,
    totalSats,
    sharePct,
    myOutputCount,
    outputCount: outputs.length,
  };

  if (myOutputCount === 0 || mySats === 0n) {
    return {
      ...base,
      ok: false,
      reason: `STOLEN? Your address is NOT among the ${outputs.length} coinbase outputs — this job does not pay you.`,
    };
  }

  if (cfg.payoutRule === "SOLO_SHOWCASE") {
    if (sharePct < cfg.minRewardShare) {
      return {
        ...base,
        ok: false,
        reason: `Solo job pays your address only ${(sharePct * 100).toFixed(2)}% of the reward (need ≥ ${(cfg.minRewardShare * 100).toFixed(0)}%).`,
      };
    }
    return {
      ...base,
      ok: true,
      reason: `Solo job pays your address ${(sharePct * 100).toFixed(2)}% of the reward (${mySats} sats).`,
    };
  }

  // PPLNS: presence + optional floor (full share-weight recompute needs
  // off-chain data we deliberately don't trust).
  const floor = cfg.minSats ?? 1n;
  if (mySats < floor) {
    return {
      ...base,
      ok: false,
      reason: `PPLNS job pays your address only ${mySats} sats (need ≥ ${floor}).`,
    };
  }
  return {
    ...base,
    ok: true,
    reason: `PPLNS job includes your address for ${mySats} sats (${(sharePct * 100).toFixed(2)}% of reward).`,
  };
}
