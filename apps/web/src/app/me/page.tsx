"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  buildMemberRegistrationEvent,
  detectNip07,
  type Nip07Signer,
} from "@hashden/nostr";
import { joinGroup, listGroups, probeLnurl, type PublicGroup } from "@/lib/api";

type Phase =
  | { kind: "DISCONNECTED" }
  | { kind: "CONNECTED"; pubkey: string; signer: Nip07Signer }
  | { kind: "JOINING" }
  | { kind: "JOINED"; slug: string }
  | { kind: "ERROR"; message: string };

export default function MePage() {
  return (
    <Suspense fallback={null}>
      <MePageBody />
    </Suspense>
  );
}

function MePageBody() {
  const searchParams = useSearchParams();
  const presetSlug = searchParams.get("join") ?? "";

  const [phase, setPhase] = useState<Phase>({ kind: "DISCONNECTED" });
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [groupsErr, setGroupsErr] = useState<string | null>(null);
  const [slug, setSlug] = useState(presetSlug);
  const [btcAddress, setBtcAddress] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");

  useEffect(() => {
    listGroups()
      .then(setGroups)
      .catch((e) => setGroupsErr((e as Error).message));
  }, []);

  async function connect() {
    const status = detectNip07();
    if (status.kind === "MISSING") {
      setPhase({
        kind: "ERROR",
        message: "No NIP-07 signer found. Install Alby or nos2x.",
      });
      return;
    }
    try {
      const pubkey = await status.signer.getPublicKey();
      setPhase({ kind: "CONNECTED", pubkey, signer: status.signer });
    } catch (e) {
      setPhase({ kind: "ERROR", message: (e as Error).message });
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase.kind !== "CONNECTED") return;
    if (!slug) {
      setPhase({ kind: "ERROR", message: "pick a group first" });
      return;
    }
    setPhase({ kind: "JOINING" });
    try {
      // Probe the Lightning address before signing — catches typos and
      // dead hosts before they cause a payout failure 100 confirmations
      // from now. Probe runs server-side via the stratum's
      // /hashden/lnurl/probe endpoint (CORS would block client-side).
      const probe = await probeLnurl(lightningAddress);
      if (!probe.ok) {
        setPhase({
          kind: "ERROR",
          message: `Lightning address didn't probe successfully (${probe.reason}). Check the address and try again.`,
        });
        return;
      }

      const unsigned = buildMemberRegistrationEvent({
        memberPubkey: phase.pubkey,
        slug,
        content: { btc_address: btcAddress, lightning_address: lightningAddress },
      });
      const signed = await phase.signer.signEvent(unsigned);
      await joinGroup(slug, signed);
      setPhase({ kind: "JOINED", slug });
    } catch (err) {
      setPhase({ kind: "ERROR", message: (err as Error).message });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to marketplace
      </Link>

      <header className="mt-3 mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">My memberships</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Register or update your BTC + Lightning addresses for a den. The
          BTC address gets your share of the coinbase directly. The Lightning
          address is the fallback for amounts too small to send on-chain.
        </p>
      </header>

      {phase.kind === "DISCONNECTED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6 mb-8">
          <div className="text-sm text-ink-dim mb-3">
            Connect your Nostr signer to begin.
          </div>
          <button
            onClick={connect}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Connect with NIP-07
          </button>
        </div>
      )}

      {phase.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Error
          </div>
          <div className="text-sm text-ink">{phase.message}</div>
          <button
            onClick={() => setPhase({ kind: "DISCONNECTED" })}
            className="mt-3 text-xs text-ink-dim underline hover:text-ink"
          >
            Reset
          </button>
        </div>
      )}

      {phase.kind === "JOINED" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Joined
          </div>
          <div className="text-sm text-ink">
            You're registered in{" "}
            <Link
              href={`/g/${phase.slug}` as any}
              className="text-accent hover:underline"
            >
              {phase.slug}
            </Link>
            . Point your hardware at the stratum URL on the group page.
          </div>
        </div>
      )}

      {(phase.kind === "CONNECTED" || phase.kind === "JOINING") && (
        <>
          <div className="rounded-md border border-line bg-bg-panel p-3 mb-6 text-xs font-mono text-ink-dim">
            connected: {phase.kind === "CONNECTED" ? phase.pubkey : "..."}
          </div>

          {phase.kind === "CONNECTED" && (() => {
            const myDens = groups.filter(
              (g) => g.operatorPubkey === phase.pubkey,
            );
            return (
              <section className="mb-10">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">Dens you operate</h2>
                  <span className="text-[10px] uppercase tracking-wider text-ink-mute">
                    {myDens.length} {myDens.length === 1 ? "den" : "dens"}
                  </span>
                </div>
                {myDens.length === 0 ? (
                  <div className="rounded-lg border border-line bg-bg-subtle p-4 text-sm text-ink-mute">
                    You don't operate any dens yet.{" "}
                    <Link
                      href={"/new" as any}
                      className="text-accent hover:underline"
                    >
                      Create one
                    </Link>
                    .
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {myDens.map((g) => (
                      <li key={g.slug}>
                        <Link
                          href={`/g/${g.slug}` as any}
                          className="block rounded-lg border border-line bg-bg-subtle p-4 hover:border-accent hover:bg-bg-elevated transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-ink truncate">
                              {g.name || g.slug}
                            </span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-mute">
                              {g.payoutRule === "SOLO_SHOWCASE" ? "solo" : "pplns"} · fee {(g.feeBps / 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-ink-mute font-mono truncate">
                            stratum.user = {g.slug}.&lt;your-pubkey&gt;.&lt;worker&gt;
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })()}

          <h2 className="mb-3 text-lg font-semibold">Join a den</h2>
          <form onSubmit={onSubmit} className="space-y-5">
            <Field label="Den">
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className={inputClass}
              >
                <option value="">pick a den…</option>
                {groups.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name} ({g.payoutRule === "SOLO_SHOWCASE" ? "solo" : "PPLNS"})
                  </option>
                ))}
              </select>
              {groupsErr && (
                <div className="mt-1 text-xs text-ink-mute">
                  Couldn't load groups: {groupsErr}
                </div>
              )}
            </Field>

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

            <button
              type="submit"
              disabled={phase.kind === "JOINING"}
              className="w-full rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors disabled:opacity-50"
            >
              {phase.kind === "JOINING"
                ? "Signing + registering…"
                : "Sign + register"}
            </button>
          </form>
        </>
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
