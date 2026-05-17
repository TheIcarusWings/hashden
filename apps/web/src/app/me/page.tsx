"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  buildMemberPreferencesEvent,
  type Nip07Signer,
} from "@hashden/nostr";
import {
  listGroupsForPubkey,
  setMemberPreferences,
  type PublicGroup,
} from "@/lib/api";
import { hexToNpub, shortNpub } from "@/lib/nostr/format";
import { useNostrAuth } from "@/lib/nostr/useNostrAuth";
import { useNostrProfile } from "@/lib/nostr/useNostrProfile";

export default function MePage() {
  const { state, connect, disconnect } = useNostrAuth();

  const [myGroups, setMyGroups] = useState<PublicGroup[]>([]);
  const [myGroupsLoaded, setMyGroupsLoaded] = useState(false);

  // Load the user's dens (operated + joined, any visibility) once we
  // know who they are. Re-runs only when the pubkey changes — same
  // pubkey across re-renders won't refetch.
  const pubkey = state.kind === "CONNECTED" ? state.pubkey : null;
  useEffect(() => {
    if (!pubkey) {
      setMyGroups([]);
      setMyGroupsLoaded(false);
      return;
    }
    let cancelled = false;
    listGroupsForPubkey(pubkey)
      .then((g) => {
        if (cancelled) return;
        setMyGroups(g);
        setMyGroupsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMyGroupsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  const operated =
    state.kind === "CONNECTED"
      ? myGroups.filter((g) => g.operatorPubkey === state.pubkey)
      : [];
  const joined =
    state.kind === "CONNECTED"
      ? myGroups.filter((g) => g.operatorPubkey !== state.pubkey)
      : [];

  // Reflect a successful preferences flip in the local list so the
  // toggle stays in sync without a refetch.
  const onMemberShowPubkeyChanged = useCallback(
    (slug: string, value: boolean) => {
      setMyGroups((prev) =>
        prev.map((g) =>
          g.slug === slug ? { ...g, memberShowPubkey: value } : g,
        ),
      );
    },
    [],
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">My account</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Your dens, your stats, and the keys that prove you own them.
        </p>
      </header>

      {(state.kind === "IDLE" || state.kind === "CONNECTING") && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-mute">
          {state.kind === "CONNECTING" ? "Connecting…" : "Loading…"}
        </div>
      )}

      {state.kind === "DISCONNECTED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6">
          <div className="text-sm text-ink-dim mb-3">
            Connect your Nostr signer to see your dens and stats.
          </div>
          <button
            onClick={connect}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Connect with NIP-07
          </button>
        </div>
      )}

      {state.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Error
          </div>
          <div className="text-sm text-ink">{state.message}</div>
          <button
            onClick={connect}
            className="mt-3 text-xs text-ink-dim underline hover:text-ink"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "CONNECTED" && (
        <>
          <AccountCard pubkey={state.pubkey} onDisconnect={disconnect} />

          <Analytics
            myGroupsLoaded={myGroupsLoaded}
            operatedCount={operated.length}
            joinedCount={joined.length}
          />

          <DenSection
            title="Dens you operate"
            emptyHint={
              <>
                You don't operate any dens yet.{" "}
                <Link
                  href={"/new" as any}
                  className="text-accent hover:underline"
                >
                  Create one
                </Link>
                .
              </>
            }
            dens={operated}
            perspective="operator"
            loaded={myGroupsLoaded}
          />

          <DenSection
            title="Dens you've joined"
            emptyHint={
              <>
                You haven't joined any dens yet.{" "}
                <Link
                  href={"/dens" as any}
                  className="text-accent hover:underline"
                >
                  Browse dens
                </Link>
                {" "}and pick one.
              </>
            }
            dens={joined}
            perspective="member"
            loaded={myGroupsLoaded}
            memberPubkey={state.pubkey}
            signer={state.signer}
            onMemberShowPubkeyChanged={onMemberShowPubkeyChanged}
          />
        </>
      )}
    </main>
  );
}

function AccountCard({
  pubkey,
  onDisconnect,
}: {
  pubkey: string;
  onDisconnect: () => void;
}) {
  const npub = hexToNpub(pubkey);
  const profileState = useNostrProfile(pubkey);
  const profile =
    profileState.kind === "LOADED" ? profileState.profile : null;
  const loading = profileState.kind === "LOADING";
  const display = profile?.displayName || profile?.name || null;
  const initials = (display ?? pubkey).slice(0, 2).toUpperCase();

  return (
    <section className="mb-10 rounded-lg border border-line bg-bg-subtle p-5">
      <div className="mb-4 text-xs uppercase tracking-wider text-ink-mute">
        Account
      </div>
      <div className="flex items-start gap-4">
        <div className="size-14 shrink-0 rounded-full bg-bg-panel border border-line flex items-center justify-center overflow-hidden text-xs font-mono">
          {profile?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.picture}
              alt={display ?? "avatar"}
              className="size-full object-cover"
            />
          ) : loading ? (
            <span className="text-ink-mute opacity-50">…</span>
          ) : (
            <span className="text-ink-mute">{initials}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-medium text-ink truncate">
            {display ?? (loading ? "Loading…" : "Anonymous")}
          </div>
          <div className="mt-0.5 text-xs text-ink-dim truncate">
            {profile?.nip05 ?? (loading ? " " : "no NIP-05")}
          </div>
          <div className="mt-2 font-mono text-[11px] text-ink-mute">
            <span className="md:hidden">{shortNpub(pubkey)}</span>
            <span className="hidden md:inline break-all leading-relaxed">
              {npub}
            </span>
          </div>
          <a
            href={`https://njump.me/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[11px] text-ink-mute hover:text-accent transition-colors"
          >
            View on njump.me ↗
          </a>
        </div>
      </div>
      <button
        onClick={onDisconnect}
        className="mt-4 text-xs text-ink-mute underline hover:text-ink"
      >
        Sign out
      </button>
    </section>
  );
}

function Analytics({
  myGroupsLoaded,
  operatedCount,
  joinedCount,
}: {
  myGroupsLoaded: boolean;
  operatedCount: number;
  joinedCount: number;
}) {
  if (!myGroupsLoaded) return null;
  return (
    <section className="mb-10 grid grid-cols-2 gap-4">
      <Stat label="Dens you operate" value={operatedCount} />
      <Stat label="Dens you've joined" value={joinedCount} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-5">
      <div className="text-xs uppercase tracking-wider text-ink-mute">
        {label}
      </div>
      <div className="mt-2 text-2xl font-mono text-ink">{value}</div>
    </div>
  );
}

function DenSection({
  title,
  emptyHint,
  dens,
  perspective,
  loaded,
  memberPubkey,
  signer,
  onMemberShowPubkeyChanged,
}: {
  title: string;
  emptyHint: React.ReactNode;
  dens: PublicGroup[];
  perspective: "operator" | "member";
  loaded: boolean;
  memberPubkey?: string;
  signer?: Nip07Signer;
  onMemberShowPubkeyChanged?: (slug: string, value: boolean) => void;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-[10px] uppercase tracking-wider text-ink-mute">
          {loaded ? `${dens.length} ${dens.length === 1 ? "den" : "dens"}` : "…"}
        </span>
      </div>
      {!loaded ? (
        <div className="rounded-lg border border-line bg-bg-subtle/40 p-4 h-16" />
      ) : dens.length === 0 ? (
        <div className="rounded-lg border border-line bg-bg-subtle p-4 text-sm text-ink-mute">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-2">
          {dens.map((g) => (
            <li
              key={g.slug}
              className="group block rounded-lg border border-line bg-bg-subtle p-4 hover:border-accent hover:bg-bg-elevated transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/g/${g.slug}` as any}
                  prefetch={false}
                  className="text-sm font-medium text-ink truncate flex items-center gap-2 hover:underline"
                >
                  {g.name || g.slug}
                  {g.visibility === "UNLISTED" && (
                    <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] tracking-wider text-accent">
                      unlisted
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-ink-mute">
                    {g.payoutRule === "SOLO_SHOWCASE" ? "solo" : "pplns"} · fee {(g.feeBps / 100).toFixed(2)}%
                  </span>
                  {perspective === "operator" && (
                    <Link
                      href={`/g/${g.slug}/settings` as any}
                      prefetch={false}
                      className="rounded border border-line bg-bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-mute hover:border-accent hover:text-accent transition-colors"
                    >
                      settings
                    </Link>
                  )}
                </div>
              </div>
              {perspective === "operator" && (
                <div className="mt-1 text-xs text-ink-mute font-mono truncate">
                  stratum.user = {g.slug}.&lt;your-npub&gt;.&lt;worker&gt;
                </div>
              )}
              {perspective === "member" &&
                memberPubkey &&
                signer &&
                onMemberShowPubkeyChanged && (
                  <PubkeyVisibilityToggle
                    slug={g.slug}
                    memberPubkey={memberPubkey}
                    signer={signer}
                    current={g.memberShowPubkey ?? false}
                    onChange={(v) => onMemberShowPubkeyChanged(g.slug, v)}
                  />
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PubkeyVisibilityToggle({
  slug,
  memberPubkey,
  signer,
  current,
  onChange,
}: {
  slug: string;
  memberPubkey: string;
  signer: Nip07Signer;
  current: boolean;
  onChange: (value: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    if (pending) return;
    setError(null);
    setPending(true);
    const next = !current;
    try {
      const unsigned = buildMemberPreferencesEvent({
        memberPubkey,
        slug,
        content: { show_pubkey: next },
      });
      const signed = await signer.signEvent(unsigned);
      const res = await setMemberPreferences(slug, signed);
      onChange(res.showPubkey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-ink-mute leading-snug">
        Show your npub publicly in this den's shares + payouts?
        {!current && (
          <span className="text-ink-mute">
            {" "}
            Currently anonymized — others see{" "}
            <span className="font-mono text-ink-dim">anon-…</span>.
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        aria-pressed={current}
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 ${
          current
            ? "border-accent bg-accent/10 text-accent hover:bg-accent/20"
            : "border-line bg-bg-panel text-ink-mute hover:border-accent hover:text-accent"
        }`}
      >
        {pending ? "…" : current ? "public" : "anonymous"}
      </button>
      {error && (
        <span className="text-[10px] text-accent" title={error}>
          ✗
        </span>
      )}
    </div>
  );
}
