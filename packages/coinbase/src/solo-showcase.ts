// Solo-showcase coinbase: 3 outputs.
//
//   1. Winner (the miner whose share solved the block) gets blockReward
//      minus fees.
//   2. Operator gets the configured operator fee.
//   3. Platform gets the configured platform fee.
//
// Solo-showcase templates are per-miner: when stratum builds a job for
// miner M, the coinbase pays M as the winner. Each miner sees a different
// template. The block-find probability stays 1:1 with raw hashrate — no
// reward sharing, just a marketplace badge for "I found this".

import type { CoinbaseOutput } from "@hashden/shared";
import { type FeeContext, splitFees } from "./fees.js";

export interface SoloShowcaseInput extends FeeContext {
  /** BTC address of the miner currently being served the template. */
  minerBtcAddress: string;
  /** BTC address that receives the operator's fee. */
  operatorBtcAddress: string;
  /** BTC address that receives the platform's fee (cold wallet). */
  platformBtcAddress: string;
  /** Member pubkey corresponding to minerBtcAddress (for the snapshot). */
  minerPubkey: string;
}

export function buildSoloShowcaseCoinbase(
  input: SoloShowcaseInput,
): CoinbaseOutput[] {
  validateAddresses(input);
  const { operatorFeeSats, platformFeeSats, remainingSats } = splitFees(input);

  const outputs: CoinbaseOutput[] = [
    {
      address: input.minerBtcAddress,
      sats: remainingSats.toString(),
      kind: "MEMBER",
      memberPubkey: input.minerPubkey,
    },
  ];

  if (operatorFeeSats > 0n) {
    outputs.push({
      address: input.operatorBtcAddress,
      sats: operatorFeeSats.toString(),
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
  return outputs;
}

function validateAddresses(input: SoloShowcaseInput): void {
  if (!input.minerBtcAddress) throw new Error("minerBtcAddress required");
  if (!input.operatorBtcAddress) throw new Error("operatorBtcAddress required");
  if (!input.platformBtcAddress) throw new Error("platformBtcAddress required");
  if (!input.minerPubkey) throw new Error("minerPubkey required");
}
