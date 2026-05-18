"use client";

// Renders a member's identifier on a den page. Most of the time the
// server returns an anonymized id like `anon-1a2b3c4d` (per-den hash);
// when the member has opted in to public display it returns their raw
// pubkey instead. Either way, if the connected NIP-07 user is *this*
// member, we tag them with a "(me)" badge so the operator can spot
// themselves in their own den's leaderboards without breaking the
// anonymization for other viewers.
//
// Matching is purely client-side: we compute the same anon id locally
// from the connected pubkey + slug. The server never learns who's
// asking, which is the whole point.

import { anonymizeMemberPubkey, isAnonymizedMemberId } from "@hashden/shared";
import { shortNpub } from "@/lib/nostr/format";
import { useNostrAuth } from "@/lib/nostr/useNostrAuth";

export function MemberPubkeyLabel({
  memberPubkey,
  slug,
  className,
}: {
  memberPubkey: string;
  slug: string;
  className?: string;
}) {
  const { state } = useNostrAuth();
  const myPubkey = state.kind === "CONNECTED" ? state.pubkey : null;
  const myAnonId = myPubkey ? anonymizeMemberPubkey(myPubkey, slug) : null;
  const isMe =
    !!myPubkey && (memberPubkey === myPubkey || memberPubkey === myAnonId);

  // What to render for the id itself:
  //   - me: prefer the short npub of my real pubkey (I know my own
  //     identity anyway; no point displaying a stale anon id back to me)
  //   - others, anon id: render as-is (short hash like "anon-1a2b3c4d")
  //   - others, real pubkey (they opted in to public): render as short npub
  const display = isMe
    ? shortNpub(myPubkey!)
    : isAnonymizedMemberId(memberPubkey)
      ? memberPubkey
      : shortNpub(memberPubkey);

  return (
    <span className={className}>
      {display}
      {isMe && (
        <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[9px] uppercase tracking-wider text-accent align-middle">
          me
        </span>
      )}
    </span>
  );
}
