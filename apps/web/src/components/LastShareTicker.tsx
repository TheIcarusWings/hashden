"use client";

import { useEffect, useState } from "react";
import { getGroupShares } from "@/lib/api";

/**
 * Live "last share Ns ago" heartbeat. The hashrate number is a 10-minute rolling
 * average — accurate but smooth, so it reads as static. Shares, by contrast, are
 * discrete events that arrive every few seconds on an active rig, so a counter
 * that ticks every second (and pulses while fresh) is what actually conveys
 * "this den is mining right now."
 *
 * Seeded by the server-rendered latest-share timestamp (instant first paint),
 * then kept accurate by a cheap targeted poll — `GET …/shares?limit=1` is an
 * `ORDER BY ts DESC LIMIT 1`, so it returns just the most-recent share without
 * the full-page refetch. Monotonic (never moves backwards), pauses on hidden
 * tabs, and re-polls on re-focus.
 */
export function LastShareTicker({
  slug,
  latestShareTs: initialTs,
  freshSeconds = 120,
  pollSeconds = 10,
}: {
  slug: string;
  latestShareTs: string | null;
  /** Below this age the den counts as actively mining (green + pulse). */
  freshSeconds?: number;
  pollSeconds?: number;
}) {
  const [latestTs, setLatestTs] = useState<string | null>(initialTs);
  const [now, setNow] = useState(() => Date.now());

  // Take a newer value if the page soft-refresh passes one in.
  useEffect(() => {
    if (initialTs) setLatestTs((cur) => (!cur || initialTs > cur ? initialTs : cur));
  }, [initialTs]);

  // 1s age tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Targeted poll of just the most-recent share.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await getGroupShares(slug, { sinceMinutes: 60, limit: 1 });
        const ts = res.shares[0]?.ts ?? null;
        if (!cancelled && ts) setLatestTs((cur) => (!cur || ts > cur ? ts : cur));
      } catch {
        /* transient — keep showing the last known value */
      }
    };
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    const id = setInterval(poll, pollSeconds * 1000);
    document.addEventListener("visibilitychange", onVisible);
    poll();
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, pollSeconds]);

  if (!latestTs) {
    return <span className="text-ink-mute">no shares yet</span>;
  }

  const ageS = Math.max(0, Math.floor((now - new Date(latestTs).getTime()) / 1000));
  const fresh = ageS < freshSeconds;
  const label =
    ageS < 90
      ? `${ageS}s`
      : ageS < 3600
        ? `${Math.floor(ageS / 60)}m`
        : ageS < 86400
          ? `${Math.floor(ageS / 3600)}h`
          : `${Math.floor(ageS / 86400)}d`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${fresh ? "text-good" : "text-ink-mute"}`}
      aria-live="polite"
    >
      {fresh && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
        </span>
      )}
      last share {label} ago
    </span>
  );
}
