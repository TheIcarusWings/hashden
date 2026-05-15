// Address → scriptPubKey encoding.
//
// Turns an array of CoinbaseOutput (symbolic: address + sats + kind) into
// a list of Bitcoin transaction outputs (concrete: scriptPubKey bytes +
// value sats). The stratum then merges these into the coinbase tx of the
// block template.
//
// Supported address types (mainnet only at MVP):
//   - P2PKH ("1..."): legacy
//   - P2SH ("3..."): legacy multisig wrapper
//   - P2WPKH/P2WSH ("bc1q..."): segwit v0 bech32
//   - P2TR ("bc1p..."): segwit v1 taproot bech32m
//
// Other networks (testnet/regtest/signet) parse via their own prefixes;
// we accept any of them as long as bitcoinjs-lib resolves them to a
// scriptPubKey. The caller (stratum) is responsible for ensuring the
// network matches the block template's chain.

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import type { CoinbaseOutput } from "@hashden/shared";

// Initialize bitcoinjs-lib's ECC backend once at module load. Required
// for P2TR (taproot, bech32m) address parsing — without it, any taproot
// address throws "No ECC Library provided". Idempotent if called twice.
bitcoin.initEccLib(ecc);

export interface EncodedOutput {
  scriptPubKey: Uint8Array;
  /** Value in satoshis as bigint (matches Bitcoin Core's int64). */
  valueSats: bigint;
  /** Carried through for downstream snapshotting. */
  kind: CoinbaseOutput["kind"];
  /** Carried through for member identification on MEMBER outputs. */
  memberPubkey?: string;
}

export interface EncodeOptions {
  /** Network — defaults to mainnet. Pass bitcoin.networks.testnet/regtest as needed. */
  network?: bitcoin.Network;
}

export function encodeOutput(
  output: CoinbaseOutput,
  opts: EncodeOptions = {},
): EncodedOutput {
  const network = opts.network ?? bitcoin.networks.bitcoin;
  let scriptPubKey: Buffer;
  try {
    scriptPubKey = bitcoin.address.toOutputScript(output.address, network);
  } catch (err) {
    throw new Error(
      `Failed to encode address ${output.address} (${output.kind}): ${
        (err as Error).message
      }`,
    );
  }
  const valueSats = BigInt(output.sats);
  if (valueSats < 0n) {
    throw new Error(
      `Negative output value not allowed (${output.address}, ${output.sats})`,
    );
  }
  return {
    scriptPubKey: new Uint8Array(scriptPubKey),
    valueSats,
    kind: output.kind,
    memberPubkey: output.memberPubkey,
  };
}

export function encodeOutputs(
  outputs: CoinbaseOutput[],
  opts: EncodeOptions = {},
): EncodedOutput[] {
  return outputs.map((o) => encodeOutput(o, opts));
}

/** Bitcoin's standard dust-output threshold for a P2WPKH-equivalent (3 × 182 = 546 sats). */
export const DUST_THRESHOLD_SATS = 546n;

/**
 * Sanity check: any output below the dust threshold would be rejected by
 * standard bitcoind nodes. Hashden's MEMBER outputs use the *configured*
 * dust threshold (typically much higher, e.g. 10k sats) to avoid creating
 * post-mature spends with bad UTXO economics, but we still guard against
 * misconfigured zero-or-near-zero outputs in the coinbase builder.
 */
export function findBelowProtocolDust(
  outputs: EncodedOutput[],
): EncodedOutput[] {
  return outputs.filter((o) => o.valueSats > 0n && o.valueSats < DUST_THRESHOLD_SATS);
}
