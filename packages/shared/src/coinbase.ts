// Coinbase output snapshot.
//
// Stored on Block.coinbaseOutputs as JSON. Records the exact split that
// went on-chain when a block was found, for auditability and for the
// payouts worker to know which dust members it owes.

export type CoinbaseOutputKind =
  | "MEMBER"          // an above-dust member's coinbase output
  | "OPERATOR_FEE"    // operator's fee output
  | "PLATFORM_FEE"    // platform's fee output (cold address)
  | "DUST_BUCKET";    // operator-owned bucket for sub-dust members; fanned out via Lightning post-maturity

export interface CoinbaseOutput {
  address: string;            // BTC address that received the output
  sats: string;               // amount as decimal-string (avoids JSON BigInt issues)
  kind: CoinbaseOutputKind;
  // For MEMBER outputs: which member's coinbase share this is.
  // For DUST_BUCKET: optionally an array of memberPubkey → sats owed,
  //                  serialized via the dustBucketBreakdown field below.
  memberPubkey?: string;
}

// For DUST_BUCKET outputs, the platform records who is owed what so the
// payouts worker can fan out post-maturity. Stored as part of the
// coinbaseOutputs JSON or in a sibling Block.dustBreakdown column.
export interface DustBreakdownEntry {
  memberPubkey: string;
  owedSats: string;
}
