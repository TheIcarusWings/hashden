"use client";

import { useEffect, useState, use, type FormEvent } from "react";
import Link from "next/link";
import {
  buildMemberRegistrationEvent,
  buildMemberRecordRequestEvent,
} from "@hashden/nostr";
import {
  getGroup,
  getMyMemberRecord,
  joinGroup,
  probeLnurl,
  type PublicGroup,
} from "@/lib/api";
import { useNostrAuth } from "@/lib/nostr/useNostrAuth";
import { useDenRole } from "@/components/DenMembershipStatus";

type SubmitState =
  | { kind: "IDLE" }
  | { kind: "SUBMITTING" }
  | { kind: "JOINED" }
  | { kind: "ERROR"; message: string };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function JoinDenPage({ params }: PageProps) {
  const { slug } = use(params);
  const { state: auth, connect } = useNostrAuth();

  const [den, setDen] = useState<PublicGroup | null>(null);
  const [denErr, setDenErr] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "IDLE" });

  // Already a member? Then this page is the "manage payout address" path:
  // registration is an upsert, so re-submitting updates the saved addresses.
  const role = useDenRole(slug, den?.operatorPubkey ?? "");
  const isExistingMember =
    role.kind === "MEMBER" || role.kind === "OPERATOR_AND_MEMBER";

  // Pre-fill current addresses on demand (not on mount — that would fire a
  // signing prompt before the member does anything). Loading requires a fresh
  // signed proof of pubkey ownership since addresses are private.
  const [prefillState, setPrefillState] = useState<
    "IDLE" | "LOADING" | "LOADED" | "ERROR"
  >("IDLE");
  async function loadMyAddresses() {
    if (auth.kind !== "CONNECTED") return;
    setPrefillState("LOADING");
    try {
      const unsigned = buildMemberRecordRequestEvent({
        memberPubkey: auth.pubkey,
        slug,
      });
      const signed = await auth.signer.signEvent(unsigned);
      const rec = await getMyMemberRecord(slug, signed);
      setBtcAddress(rec.btcAddress);
      setLightningAddress(rec.lightningAddress);
      setPrefillState("LOADED");
    } catch {
      setPrefillState("ERROR");
    }
  }

  useEffect(() => {
    let cancelled = false;
    getGroup(slug)
      .then((g) => {
        if (cancelled) return;
        if (!g) {
          setDenErr("This den doesn't exist (or was deleted).");
        } else {
          setDen(g);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setDenErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (auth.kind !== "CONNECTED") return;
    setSubmitState({ kind: "SUBMITTING" });
    try {
      // Probe the Lightning address first — typos here cause silent
      // payout failures 100+ confirmations from now, so catch them up
      // front. Probe runs server-side via the stratum (CORS would
      // block client-side LNURL fetches).
      const probe = await probeLnurl(lightningAddress);
      if (!probe.ok) {
        setSubmitState({
          kind: "ERROR",
          message: `Lightning address didn't probe successfully (${probe.reason}). Check the address and try again.`,
        });
        return;
      }
      const unsigned = buildMemberRegistrationEvent({
        memberPubkey: auth.pubkey,
        slug,
        content: { btc_address: btcAddress, lightning_address: lightningAddress },
      });
      const signed = await auth.signer.signEvent(unsigned);
      await joinGroup(slug, signed);
      setSubmitState({ kind: "JOINED" });
    } catch (err) {
      setSubmitState({ kind: "ERROR", message: (err as Error).message });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={`/g/${slug}` as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to den
      </Link>

      <header className="mt-3 mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {isExistingMember
            ? "Manage payout address"
            : `Join ${den?.name ?? slug}`}
        </h1>
        <p className="mt-2 text-sm text-ink-dim">
          {isExistingMember ? (
            <>
              You&apos;re already a member of this den. Re-enter your BTC +
              Lightning address below to update what&apos;s on file — the new
              values replace the old.
            </>
          ) : (
            <>
              Register your BTC + Lightning addresses for this den. The BTC
              address gets your share of the coinbase directly. The Lightning
              address is the fallback for amounts too small to send on-chain.
            </>
          )}
        </p>
      </header>

      {denErr && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Error
          </div>
          <div className="text-sm text-ink">{denErr}</div>
        </div>
      )}

      {!denErr && (auth.kind === "IDLE" || auth.kind === "CONNECTING") && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-mute">
          {auth.kind === "CONNECTING" ? "Connecting…" : "Loading…"}
        </div>
      )}

      {!denErr && auth.kind === "DISCONNECTED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6">
          <div className="text-sm text-ink-dim mb-3">
            Connect your Nostr signer to register.
          </div>
          <button
            onClick={connect}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Connect with NIP-07
          </button>
        </div>
      )}

      {!denErr && auth.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Couldn't connect
          </div>
          <div className="text-sm text-ink">{auth.message}</div>
          <button
            onClick={connect}
            className="mt-3 text-xs text-ink-dim underline hover:text-ink"
          >
            Try again
          </button>
        </div>
      )}

      {!denErr && auth.kind === "CONNECTED" && submitState.kind !== "JOINED" && (
        <form onSubmit={onSubmit} className="space-y-5">
          {isExistingMember && prefillState !== "LOADED" && (
            <div className="rounded-lg border border-line bg-bg-subtle p-4 text-sm">
              <div className="text-ink-dim mb-2">
                Editing your payout for this den. Load your saved addresses to
                edit them, or just enter new values to replace what&apos;s on
                file.
              </div>
              <button
                type="button"
                onClick={loadMyAddresses}
                disabled={prefillState === "LOADING"}
                className="rounded-md border border-line bg-bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
              >
                {prefillState === "LOADING"
                  ? "Signing + loading…"
                  : "Load my saved addresses"}
              </button>
              {prefillState === "ERROR" && (
                <span className="ml-3 text-xs text-accent">
                  Couldn&apos;t load — enter your addresses manually.
                </span>
              )}
            </div>
          )}
          <Field
            label="BTC address"
            hint="Receives coinbase outputs above the dust threshold (~10k sats default)"
          >
            <input
              value={btcAddress}
              onChange={(e) => setBtcAddress(e.target.value.trim())}
              required
              placeholder="bc1q…"
              className={inputClass}
            />
          </Field>
          <Field
            label="Lightning address"
            hint="Dust fallback. user@host format, must accept LNURL-pay."
          >
            <input
              value={lightningAddress}
              onChange={(e) => setLightningAddress(e.target.value.trim())}
              required
              placeholder="you@walletofsatoshi.com"
              className={inputClass}
            />
          </Field>

          {submitState.kind === "ERROR" && (
            <div className="rounded-lg border border-accent/30 bg-bg-subtle p-4 text-sm text-ink">
              {submitState.message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitState.kind === "SUBMITTING"}
            className="w-full rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors disabled:opacity-50"
          >
            {submitState.kind === "SUBMITTING"
              ? "Signing + saving…"
              : isExistingMember
                ? "Update payout address"
                : "Sign + register"}
          </button>
        </form>
      )}

      {submitState.kind === "JOINED" && (
        <div className="rounded-lg border border-good/40 bg-good/5 p-5">
          <div className="text-xs uppercase tracking-wider text-good mb-1">
            {isExistingMember ? "Updated" : "Joined"}
          </div>
          <div className="text-sm text-ink">
            {isExistingMember
              ? "Your payout addresses are updated. "
              : "You're registered. "}
            Point your hardware at the stratum URL on the{" "}
            <Link
              href={`/g/${slug}` as any}
              className="text-accent hover:underline"
            >
              den page
            </Link>
            .
          </div>
        </div>
      )}
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-ink-mute mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-mute">{hint}</div>}
    </label>
  );
}
