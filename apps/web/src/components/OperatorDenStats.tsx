"use client";

// Compact operator-dashboard stats for one den, rendered inside the
// "Dens you operate" cards on /me. Fetches the per-den aggregate
// (last block, accumulated operator + platform fees, top members by
// reward) from the stratum API. Leaderboard ids are already anonymized
// server-side unless the member opted in; MemberPubkeyLabel handles the
// "(me)" tagging locally without deanonymizing anyone else.

import { useEffect, useState } from "react";
import { getOperatorStats, type OperatorStats } from "@/lib/api";
import { MemberPubkeyLabel } from "@/components/MemberPubkeyLabel";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; stats: OperatorStats }
  | { kind: "error" };

export function OperatorDenStats({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getOperatorStats(slug)
      .then((stats) => {
        if (!cancelled) setState({ kind: "loaded", stats });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Stay quiet if the stratum API is unreachable — never break the card.
  if (state.kind === "error") return null;

  if (state.kind === "loading") {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="h-4 w-40 animate-pulse rounded bg-bg-panel" />
      </div>
    );
  }

  const { stats } = state;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {stats.blockCount === 0 ? (
        <p className="text-[11px] text-ink-mute">
          No blocks found yet — operator fees accrue once this den mines a
          block.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-xs">
            <StatItem
              label="Last block"
              value={stats.lastBlockAt ? timeAgo(stats.lastBlockAt) : "—"}
            />
            <StatItem
              label="Your fee earned"
              value={formatSats(stats.operatorFeeSats)}
            />
            <StatItem
              label="Platform fee paid"
              value={formatSats(stats.platformFeeSats)}
            />
          </dl>

          {stats.leaderboard.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">
                Top members by reward
              </div>
              <ol className="space-y-0.5 font-mono text-[11px]">
                {stats.leaderboard.map((m, i) => (
                  <li
                    key={m.memberPubkey}
                    className="flex justify-between gap-3"
                  >
                    <span className="truncate text-ink-dim">
                      {i + 1}.{" "}
                      <MemberPubkeyLabel
                        memberPubkey={m.memberPubkey}
                        slug={slug}
                      />
                    </span>
                    <span className="shrink-0 text-ink">
                      {formatSats(m.rewardSats)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-mute">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-ink">{value}</dd>
    </div>
  );
}

// Sats below 0.01 BTC read better as sats; larger amounts as BTC.
function formatSats(sats: string): string {
  const n = Number(sats);
  if (!Number.isFinite(n)) return `${sats} sats`;
  if (n >= 1_000_000) return `${(n / 1e8).toFixed(4)} BTC`;
  return `${n.toLocaleString()} sats`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
