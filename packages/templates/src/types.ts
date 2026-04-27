// Bitcoin block template + template-source types.
//
// We don't model every field of `getblocktemplate` here — only the
// subset hashden's stratum and coinbase pipeline care about. The full
// payload is preserved opaquely as `raw` so consumers that need extras
// (mutable, mintime, version-bits, etc.) can dig in without us
// over-fitting types to a moving target.

export interface BlockTemplate {
  /** Block height this template would solve. */
  height: number;
  /** Total coinbase value (subsidy + tx fees), in satoshis. */
  coinbasevalue: number;
  /** Compact difficulty target. */
  bits: string;
  /** Hash of the parent block this template extends. */
  previousblockhash: string;
  /** Difficulty target as 32-byte big-endian hex. */
  target: string;
  /** Minimum allowed timestamp (median of last 11 blocks). */
  mintime: number;
  /** Transactions to include (txid + serialized data + dependencies). */
  transactions: BlockTemplateTx[];
  /** Default witness commitment (P2_REGTEST and segwit blocks). */
  default_witness_commitment?: string;
  /** Original RPC payload — caller-defined fields preserved for downstream use. */
  raw: unknown;
}

export interface BlockTemplateTx {
  data: string;
  txid: string;
  hash: string;
  depends?: number[];
  fee?: number;
  sigops?: number;
  weight?: number;
}

/**
 * Where a given group fetches its block template from. Stored on Group as
 * `templateSource` (enum) + `operatorRpcUrl` + `operatorRpcAuth` (encrypted).
 */
export type TemplateSource =
  | {
      kind: "PLATFORM_DEFAULT";
    }
  | {
      kind: "OPERATOR_RPC";
      /** Operator's Bitcoin RPC URL (Core/Knots/Libre Relay). */
      url: string;
      /** HTTP basic-auth `user:pass`. Resolved from operatorRpcAuth at runtime. */
      auth: string;
    };

/** Standard RPC error shape per JSON-RPC 2.0. */
export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export class BitcoinRpcError extends Error {
  constructor(
    message: string,
    readonly cause?:
      | { kind: "TIMEOUT" }
      | { kind: "HTTP"; status: number }
      | { kind: "RPC"; error: RpcError }
      | { kind: "PARSE"; original: unknown },
  ) {
    super(message);
    this.name = "BitcoinRpcError";
  }
}
