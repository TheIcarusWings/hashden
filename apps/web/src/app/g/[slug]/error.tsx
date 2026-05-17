"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real cause in the browser console so we can debug
    // intermittent failures (e.g. transient API hiccups).
    console.error("group page error:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="text-xs uppercase tracking-[0.2em] text-accent mb-3">
        Something went wrong
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-4">
        Couldn't load this den.
      </h1>
      <p className="text-sm text-ink-dim leading-relaxed mb-3">
        This usually clears up after a refresh. If it keeps happening, DM me
        on Nostr.
      </p>
      <p className="text-xs text-ink-mute font-mono mb-8 break-all">
        {error.message}
        {error.digest ? ` (digest: ${error.digest})` : ""}
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
        >
          Try again
        </button>
        <Link
          href={"/" as any}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-ink-mute transition-colors"
        >
          Back to dens
        </Link>
      </div>
    </main>
  );
}
