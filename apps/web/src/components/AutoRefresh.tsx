"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered (force-dynamic) page live by calling
 * `router.refresh()` on an interval — re-runs the page's server components and
 * soft-swaps the fresh markup in without a full reload or losing client state.
 * Used on the den page so hashrate, shares, the coinbase preview, blocks, etc.
 * update on their own.
 *
 * Pauses while the tab is hidden (don't poll a backgrounded page) and refreshes
 * immediately when it becomes visible again. Renders a subtle "live" indicator
 * with a seconds-since-refresh counter.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [secsAgo, setSecsAgo] = useState(0);

  useEffect(() => {
    const refresh = () => {
      router.refresh();
      setSecsAgo(0);
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const refreshTimer = setInterval(() => {
      if (!document.hidden) refresh();
    }, seconds * 1000);
    const tick = setInterval(() => setSecsAgo((s) => s + 1), 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(refreshTimer);
      clearInterval(tick);
    };
  }, [router, seconds]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-ink-mute"
      aria-live="polite"
      title={`Auto-refreshing every ${seconds}s`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
      </span>
      live · {secsAgo}s ago
    </span>
  );
}
