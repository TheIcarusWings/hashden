"use client";

// Stats panel for /me: the connected user's rolling hashrate (10-min
// window) + per-den breakdown over the last 24h. Fetched client-side
// from /hashden/members/:pubkey/stats since /me already runs in the
// browser to know who's connected.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMemberStats, type MemberStats } from "@/lib/api";

const WINDOW_MINUTES = 24 * 60;

export function MyMiningStats({ pubkey }: { pubkey: string }) {
  const [state, setState] = useState<
    | { kind: "LOADING" }
    | { kind: "LOADED"; stats: MemberStats }
    | { kind: "ERROR"; message: string }
  >({ kind: "LOADING" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "LOADING" });
    getMemberStats(pubkey, WINDOW_MINUTES)
      .then((stats) => {
        if (!cancelled) setState({ kind: "LOADED", stats });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ kind: "ERROR", message: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  return (
    <section className="mb-10 rounded-lg border border-line bg-bg-subtle p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-ink-mute">
          Your mining
        </h2>
        {state.kind === "LOADED" && (
          <span className="text-[10px] uppercase tracking-wider text-ink-mute">
            last {Math.round(state.stats.windowMinutes / 60)}h
          </span>
        )}
      </div>

      {state.kind === "LOADING" && (
        <div className="text-sm text-ink-mute">loading…</div>
      )}

      {state.kind === "ERROR" && (
        <div className="text-xs text-ink-mute">unavailable: {state.message}</div>
      )}

      {state.kind === "LOADED" && <Loaded stats={state.stats} />}
    </section>
  );
}

function Loaded({ stats }: { stats: MemberStats }) {
  const totalShares = stats.perDen.reduce((sum, d) => sum + d.shareCount, 0);
  const anyHashrate = Number(stats.currentHashrateHs) > 0;

  return (
    <>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-semibold text-ink leading-none">
          {formatHashrate(stats.currentHashrateHs)}
        </span>
        <span className="text-xs text-ink-mute">
          rolling avg, last {stats.currentWindowMinutes} min
        </span>
      </div>
      <div className="mb-5 text-xs text-ink-mute">
        {stats.currentShareCount.toLocaleString()} share
        {stats.currentShareCount === 1 ? "" : "s"} in that window ·{" "}
        {totalShares.toLocaleString()} share{totalShares === 1 ? "" : "s"} in the last 24h
      </div>

      {stats.perDen.length === 0 ? (
        <div className="text-sm text-ink-mute">
          No shares recorded in the last 24h. Point a Bitaxe at a den you've
          joined to get started.
        </div>
      ) : (
        <>
          <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-mute">
            By den (last {Math.round(stats.windowMinutes / 60)}h)
          </div>
          <ul className="space-y-1 text-xs font-mono">
            {stats.perDen.map((d) => (
              <li
                key={d.slug}
                className="flex items-baseline justify-between gap-3"
              >
                <Link
                  href={`/g/${d.slug}` as any}
                  prefetch={false}
                  className="text-ink hover:text-accent transition-colors truncate"
                >
                  {d.slug}
                </Link>
                <span className="text-ink-dim">
                  {d.shareCount.toLocaleString()} share
                  {d.shareCount === 1 ? "" : "s"}
                </span>
                <span className="text-ink shrink-0">
                  {formatHashrate(d.hashrateHs)}
                </span>
              </li>
            ))}
          </ul>
          {!anyHashrate && (
            <div className="mt-3 text-[11px] text-ink-mute leading-relaxed">
              No recent shares in the last {stats.currentWindowMinutes} min —
              the per-den totals above span the whole 24h window. Check that
              your Bitaxe is connected.
            </div>
          )}
        </>
      )}
    </>
  );
}

function formatHashrate(hsStr: string): string {
  const hs = Number(hsStr);
  if (!Number.isFinite(hs) || hs <= 0) return "0 H/s";
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let i = 0;
  let v = hs;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const formatted =
    v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2);
  return `${formatted} ${units[i]}`;
}
