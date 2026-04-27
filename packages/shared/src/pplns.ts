// Shared type for PPLNS member input.
//
// @hashden/groups produces these (via computePplnsWindow against the DB)
// and @hashden/coinbase consumes them (via buildPplnsCoinbase). Lives in
// shared so neither package depends on the other.

export interface PplnsMember {
  /** Nostr pubkey (hex). */
  memberPubkey: string;
  /** Member's BTC address from Member.btcAddress. */
  btcAddress: string;
  /** Sum of share difficulties in the PPLNS window, scaled to bigint. */
  shareWeight: bigint;
}
