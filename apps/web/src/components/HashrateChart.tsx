// Hashrate panel for a den: prominent "current" number + bar chart of
// the last N hours bucketed at 30-min intervals. Pure SVG; no chart
// library dependency. Rendered as a server component since the API
// fetch runs once on each request.

import { getGroupHashrate, type GroupHashrate } from "@/lib/api";
import { LastShareTicker } from "@/components/LastShareTicker";

const WINDOW_MINUTES = 24 * 60; // 24h
const BUCKETS = 48; // 30-min cells

export async function HashrateChart({
  slug,
  latestShareTs,
}: {
  slug: string;
  /** Timestamp of the most recent share (from the page's shares fetch). */
  latestShareTs: string | null;
}) {
  let data: GroupHashrate | null = null;
  let error: string | null = null;
  try {
    data = await getGroupHashrate(slug, {
      windowMinutes: WINDOW_MINUTES,
      buckets: BUCKETS,
    });
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <section className="rounded-lg border border-line bg-bg-subtle p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm uppercase tracking-wider text-ink-mute">
          Hashrate
        </h2>
        {data && (
          <span className="text-[10px] uppercase tracking-wider text-ink-mute">
            last {Math.round(data.windowMinutes / 60)}h
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-ink-mute">unavailable: {error}</div>
      )}

      {data && (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-semibold text-ink leading-none">
              {formatHashrate(data.currentHashrateHs)}
            </span>
            <span className="text-xs text-ink-mute">
              rolling avg, last {data.currentWindowMinutes} min
            </span>
          </div>
          <div className="mb-4 flex items-center gap-2 flex-wrap text-xs text-ink-mute">
            <span>
              {data.currentShareCount.toLocaleString()} share
              {data.currentShareCount === 1 ? "" : "s"} in that window
            </span>
            <span>·</span>
            <LastShareTicker latestShareTs={latestShareTs} />
          </div>
          <BarChart buckets={data.buckets} bucketMinutes={data.bucketMinutes} />
        </>
      )}
    </section>
  );
}

function BarChart({
  buckets,
  bucketMinutes,
}: {
  buckets: GroupHashrate["buckets"];
  bucketMinutes: number;
}) {
  // Tight SVG with internal viewBox math; container sizes via CSS.
  const W = 100; // viewBox width (percentage-style)
  const H = 32;
  const gap = 1;
  const cellW = (W - gap * (buckets.length - 1)) / Math.max(buckets.length, 1);

  // Peak normalization. If everything is zero we still want a visible
  // baseline so the chart doesn't look broken on a brand-new den.
  const peak = buckets.reduce((m, b) => {
    const v = Number(BigInt(b.hashrateHs));
    return v > m ? v : m;
  }, 0);

  const hasAny = peak > 0;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-16 w-full"
        aria-hidden="true"
      >
        {/* baseline */}
        <line
          x1={0}
          y1={H - 0.25}
          x2={W}
          y2={H - 0.25}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={0.25}
        />
        {buckets.map((b, i) => {
          const v = Number(BigInt(b.hashrateHs));
          const ratio = hasAny ? v / peak : 0;
          // Minimum visible nub for zero-buckets so the x-axis is
          // legible; full height = bar matches the peak.
          const barH = ratio > 0 ? Math.max(0.5, ratio * (H - 1)) : 0;
          const x = i * (cellW + gap);
          const y = H - barH;
          return (
            <rect
              key={b.ts}
              x={x}
              y={y}
              width={cellW}
              height={barH}
              className={ratio > 0 ? "fill-accent" : "fill-transparent"}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-mono text-ink-mute">
        <span>
          {new Date(buckets[0]?.ts ?? Date.now()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span>
          {bucketMinutes}-min buckets · peak {formatHashrate(BigInt(Math.round(peak)).toString())}
        </span>
        <span>now</span>
      </div>
    </div>
  );
}

// SI-prefixed hashrate. Input is H/s as a decimal string (server returns
// BigInt-safe). Handle up to EH/s — beyond that we'd be the Bitcoin
// network and have bigger problems.
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
  // 2 sig figs for small numbers, 1 decimal otherwise — same shape
  // people are used to from mempool.space.
  const formatted =
    v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2);
  return `${formatted} ${units[i]}`;
}
