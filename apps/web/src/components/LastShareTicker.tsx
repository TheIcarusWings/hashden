"use client";

import { useEffect, useState } from "react";

/**
 * Live "last share Ns ago" heartbeat. The hashrate number is a 10-minute rolling
 * average — accurate but smooth, so it reads as static. Shares, by contrast, are
 * discrete events that arrive every few seconds on an active rig, so a counter
 * that ticks every second (and pulses while fresh) is what actually conveys
 * "this den is mining right now."
 *
 * Driven by the latest share timestamp the den page already fetches; the 30s
 * page soft-refresh feeds in a newer timestamp when more shares land, so the
 * counter resets on real activity.
 */
export function LastShareTicker({
  latestShareTs,
  freshSeconds = 120,
}: {
  latestShareTs: string | null;
  /** Below this age the den counts as actively mining (green + pulse). */
  freshSeconds?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!latestShareTs) {
    return <span className="text-ink-mute">no shares yet</span>;
  }

  const ageS = Math.max(
    0,
    Math.floor((now - new Date(latestShareTs).getTime()) / 1000),
  );
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
