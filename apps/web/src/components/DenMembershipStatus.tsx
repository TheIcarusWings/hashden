"use client";

// Two pieces of UI that both need to know the connected NIP-07 identity
// + this user's relationship to the den. Bundled in one component so we
// fetch /groups/by/:pubkey once, share the result, and avoid drift
// between what the banner claims and what the worker-name hint shows.
//
//  - <MembershipBanner>: prominent role pill at the top of the den page
//    (operator / member / operator-and-member / not-a-member / signed-out)
//  - <WorkerUsernameHint>: replaces the static "<slug>.<your-npub>.<rig>"
//    placeholder in the "Point your hardware here" block, pre-filling
//    the real npub when we know it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { listGroupsForPubkey } from "@/lib/api";
import { hexToNpub, shortNpub } from "@/lib/nostr/format";
import { useNostrAuth } from "@/lib/nostr/useNostrAuth";

type Role =
  | { kind: "LOADING" }
  | { kind: "SIGNED_OUT" }
  | { kind: "NOT_MEMBER"; pubkey: string }
  | { kind: "MEMBER"; pubkey: string }
  | { kind: "OPERATOR_ONLY"; pubkey: string }
  | { kind: "OPERATOR_AND_MEMBER"; pubkey: string };

// Page-load cache keyed by pubkey. Two components on the same page
// share one network round-trip; navigating to another den re-uses the
// answer for the same user (it includes every den they're in).
const cache = new Map<string, ReturnType<typeof listGroupsForPubkey>>();

function useDenRole(slug: string, operatorPubkey: string): Role {
  const { state } = useNostrAuth();
  const [role, setRole] = useState<Role>({ kind: "LOADING" });

  useEffect(() => {
    if (state.kind === "IDLE" || state.kind === "CONNECTING") {
      setRole({ kind: "LOADING" });
      return;
    }
    if (state.kind !== "CONNECTED") {
      setRole({ kind: "SIGNED_OUT" });
      return;
    }
    let cancelled = false;
    setRole({ kind: "LOADING" });
    let pending = cache.get(state.pubkey);
    if (!pending) {
      pending = listGroupsForPubkey(state.pubkey);
      cache.set(state.pubkey, pending);
    }
    pending
      .then((groups) => {
        if (cancelled) return;
        const den = groups.find((g) => g.slug === slug);
        const isOperator = state.pubkey === operatorPubkey;
        if (!den) {
          // Operator should always be in the list — guard branch in
          // case of cache staleness or eventual-consistency surprises.
          setRole(
            isOperator
              ? { kind: "OPERATOR_ONLY", pubkey: state.pubkey }
              : { kind: "NOT_MEMBER", pubkey: state.pubkey },
          );
          return;
        }
        const memberRowExists = den.memberShowPubkey !== null;
        if (isOperator) {
          setRole({
            kind: memberRowExists ? "OPERATOR_AND_MEMBER" : "OPERATOR_ONLY",
            pubkey: state.pubkey,
          });
        } else {
          setRole({ kind: "MEMBER", pubkey: state.pubkey });
        }
      })
      .catch(() => {
        // Fail open — default to "not member" so the join CTA still shows.
        if (!cancelled)
          setRole(
            state.pubkey === operatorPubkey
              ? { kind: "OPERATOR_ONLY", pubkey: state.pubkey }
              : { kind: "NOT_MEMBER", pubkey: state.pubkey },
          );
      });
    return () => {
      cancelled = true;
    };
  }, [state, slug, operatorPubkey]);

  return role;
}

export function MembershipBanner({
  slug,
  operatorPubkey,
}: {
  slug: string;
  operatorPubkey: string;
}) {
  const role = useDenRole(slug, operatorPubkey);
  if (role.kind === "LOADING") return null;
  return (
    <div className={"mb-6 " + bannerWrapperClass(role.kind)}>
      <div className="text-xs leading-relaxed flex items-baseline justify-between gap-3 flex-wrap">
        <span>{bannerCopy(role)}</span>
        {bannerCta(role, slug)}
      </div>
    </div>
  );
}

function bannerWrapperClass(kind: Role["kind"]): string {
  switch (kind) {
    case "OPERATOR_AND_MEMBER":
    case "MEMBER":
      return "rounded-md border border-good/40 bg-good/5 px-3 py-2 text-good";
    case "OPERATOR_ONLY":
      return "rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-accent";
    case "NOT_MEMBER":
      return "rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-accent";
    case "SIGNED_OUT":
      return "rounded-md border border-line bg-bg-subtle px-3 py-2 text-ink-mute";
    default:
      return "";
  }
}

function bannerCopy(role: Role): string {
  switch (role.kind) {
    case "OPERATOR_AND_MEMBER":
      return "You operate AND mine in this den.";
    case "OPERATOR_ONLY":
      return "You're the operator of this den, but not registered as a miner — join below to point hardware at your own den.";
    case "MEMBER":
      return "You're a member of this den.";
    case "NOT_MEMBER":
      return "You're signed in but not a member of this den yet.";
    case "SIGNED_OUT":
      return "Sign in with NIP-07 to see your role in this den.";
    default:
      return "";
  }
}

function bannerCta(role: Role, slug: string): React.ReactNode {
  switch (role.kind) {
    case "OPERATOR_AND_MEMBER":
      return (
        <Link
          href={`/g/${slug}/settings` as any}
          className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          Settings ↗
        </Link>
      );
    case "OPERATOR_ONLY":
    case "NOT_MEMBER":
      return (
        <Link
          href={`/g/${slug}/join` as any}
          className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          Join this den ↗
        </Link>
      );
    case "MEMBER":
      return (
        <Link
          href={"/me" as any}
          className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          Your dens ↗
        </Link>
      );
    case "SIGNED_OUT":
    default:
      return null;
  }
}

export function WorkerUsernameHint({
  slug,
  operatorPubkey,
}: {
  slug: string;
  operatorPubkey: string;
}) {
  const role = useDenRole(slug, operatorPubkey);
  const signedInPubkey =
    role.kind === "MEMBER" ||
    role.kind === "OPERATOR_AND_MEMBER" ||
    role.kind === "NOT_MEMBER" ||
    role.kind === "OPERATOR_ONLY"
      ? role.pubkey
      : null;
  const myNpub = signedInPubkey ? hexToNpub(signedInPubkey) : null;
  const myShort = signedInPubkey ? shortNpub(signedInPubkey) : null;

  if (!signedInPubkey) {
    return (
      <span>
        <code className="text-ink-dim">
          {slug}.&lt;your-npub&gt;.&lt;worker-id&gt;
        </code>
      </span>
    );
  }

  const isMember =
    role.kind === "MEMBER" || role.kind === "OPERATOR_AND_MEMBER";
  const fullTemplate = `${slug}.${myNpub}.<worker-id>`;

  return (
    <span className="block">
      <code className="text-ink break-all">
        {slug}.<span className="text-accent">{myShort}</span>.&lt;worker-id&gt;
      </code>
      <span className="mt-1.5 block text-[11px] text-ink-mute">
        {isMember ? (
          <>
            <CopyButton text={fullTemplate} label="Copy template" /> — replace{" "}
            <code>&lt;worker-id&gt;</code> with any name for the rig (e.g.{" "}
            <code>bitaxe-01</code>).
          </>
        ) : (
          <>
            You're signed in but not a member of this den yet —{" "}
            <Link
              href={`/g/${slug}/join` as any}
              className="text-accent underline underline-offset-2 hover:opacity-80"
            >
              join first
            </Link>{" "}
            so the stratum will authorize this username.
          </>
        )}
      </span>
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (insecure context, denied permission). The
      // template is fully visible above, so the user can always select +
      // copy manually — no need to surface an error UI.
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded border border-line bg-bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-mute hover:border-accent hover:text-accent transition-colors"
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}
