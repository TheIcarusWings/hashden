// Polymorphic Lightning client interface.
//
// Both LnbitsClient (HTTP API to operator's LNbits) and NwcClient
// (NIP-47 over Nostr to operator's NWC-compatible wallet) implement
// this. dust-fanout takes any LnClient; index.ts decides which to
// instantiate based on Group.operatorLnType.
//
// Shape is the minimum dust-fanout + reconcileInFlight need:
//   - payLightningAddress(addr, sats) → bolt11 + paymentHash
//   - getPaymentStatus(hash) for IN_FLIGHT crash-recovery reconciliation

export interface PaymentResult {
  /** Hex payment hash (proof-of-payment lookup key). */
  paymentHash: string;
  /** Optional preimage if available immediately. */
  preimage?: string;
}

export interface PaymentStatus {
  paid: boolean;
  pending: boolean;
}

export interface LnClient {
  /** Pays a Lightning address (resolves LUD-16 → bolt11 → pay). */
  payLightningAddress(
    lightningAddress: string,
    sats: bigint,
  ): Promise<PaymentResult>;
  /** Looks up payment status by hash for crash recovery. */
  getPaymentStatus(paymentHash: string): Promise<PaymentStatus>;
}
