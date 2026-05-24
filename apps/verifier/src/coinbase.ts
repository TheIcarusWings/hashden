// Reconstruct and parse the coinbase transaction from Stratum V1 job parts.
//
// A miner receives `coinbase1` and `coinbase2` in mining.notify and
// `extranonce1` in the mining.subscribe response; it chooses `extranonce2`
// (size advertised by the server). The full coinbase tx is:
//
//   coinbase1 + extranonce1 + extranonce2 + coinbase2
//
// All payout OUTPUTS live in `coinbase2` (the tail, after the input script), so
// they're independent of whatever extranonce2 the miner picks — we use zero
// filler purely to make a well-formed tx we can deserialize.

import * as bitcoin from "bitcoinjs-lib";

export interface CoinbaseOutputParsed {
  /** Raw output script (scriptPubKey) bytes. */
  scriptPubKey: Uint8Array;
  /** Output value in satoshis. */
  valueSats: bigint;
}

/**
 * Reconstruct the full coinbase tx hex from the stratum job parts. `extranonce2`
 * is filled with zeros of the advertised size — outputs don't depend on it.
 */
export function reconstructCoinbaseHex(
  coinbase1: string,
  extranonce1: string,
  extranonce2Size: number,
  coinbase2: string,
): string {
  if (extranonce2Size < 0 || extranonce2Size > 64) {
    throw new Error(`Implausible extranonce2_size: ${extranonce2Size}`);
  }
  const extranonce2 = "00".repeat(extranonce2Size);
  return (coinbase1 + extranonce1 + extranonce2 + coinbase2).toLowerCase();
}

/**
 * Parse the outputs of a legacy-serialized coinbase tx. The stratum coinbase
 * parts use the non-witness serialization (the form the coinbase txid/merkle is
 * computed over), so bitcoinjs deserializes it as a legacy tx and we read every
 * output's scriptPubKey + value.
 */
export function parseCoinbaseOutputs(
  coinbaseHex: string,
): CoinbaseOutputParsed[] {
  const tx = bitcoin.Transaction.fromHex(coinbaseHex);
  return tx.outs.map((out) => ({
    scriptPubKey: new Uint8Array(out.script),
    valueSats: BigInt(out.value),
  }));
}

/** Convenience: reconstruct then parse in one step. */
export function parseJobCoinbaseOutputs(
  coinbase1: string,
  extranonce1: string,
  extranonce2Size: number,
  coinbase2: string,
): CoinbaseOutputParsed[] {
  return parseCoinbaseOutputs(
    reconstructCoinbaseHex(coinbase1, extranonce1, extranonce2Size, coinbase2),
  );
}
