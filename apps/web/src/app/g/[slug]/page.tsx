import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGroup,
  getGroupBlocks,
  getGroupShares,
} from "@/lib/api";
import { HASHDEN_STRATUM_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const group = await getGroup(slug);
  if (!group) notFound();

  // Best-effort fetch of stats. Don't fail the page if either errors.
  let shares: Awaited<ReturnType<typeof getGroupShares>> | null = null;
  let blocks: Awaited<ReturnType<typeof getGroupBlocks>> | null = null;
  try {
    shares = await getGroupShares(slug, { sinceMinutes: 60, limit: 5000 });
  } catch {
    /* ignore */
  }
  try {
    blocks = await getGroupBlocks(slug, 10);
  } catch {
    /* ignore */
  }

  // Aggregate share weight per member for a leaderboard.
  const memberWeights = new Map<string, number>();
  if (shares) {
    for (const s of shares.shares) {
      memberWeights.set(
        s.memberPubkey,
        (memberWeights.get(s.memberPubkey) ?? 0) + s.difficulty,
      );
    }
  }
  const leaderboard = [...memberWeights.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to marketplace
      </Link>

      <header className="mt-3 mb-12 flex items-end justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-2">
            {group.payoutRule === "SOLO_SHOWCASE" ? "Solo showcase" : "PPLNS"}{" "}
            · {(group.feeBps / 100).toFixed(2)}% fee ·{" "}
            {group.templateSource === "OPERATOR_RPC"
              ? "operator template"
              : "platform template"}
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {group.name}
          </h1>
          <div className="mt-3 text-xs font-mono text-ink-mute">
            operator: {group.operatorPubkey.slice(0, 16)}…{group.operatorPubkey.slice(-8)}
          </div>
        </div>
        <Link
          href={`/me?join=${slug}` as any}
          className="rounded-md bg-accent text-bg px-5 py-2.5 text-sm font-medium hover:bg-accent-glow transition-colors whitespace-nowrap"
        >
          Join this den
        </Link>
      </header>

      {group.description && (
        <p className="text-sm text-ink-dim leading-relaxed mb-12 whitespace-pre-line">
          {group.description}
        </p>
      )}

      <section className="rounded-lg border border-line bg-bg-subtle p-5 mb-10">
        <div className="text-xs uppercase tracking-wider text-ink-mute mb-2">
          Point your hardware here
        </div>
        <div className="font-mono text-sm break-all text-ink">
          {HASHDEN_STRATUM_URL}
        </div>
        <div className="mt-2 text-xs text-ink-mute">
          worker username:{" "}
          <code className="text-ink-dim">
            {slug}.&lt;your-pubkey&gt;.&lt;worker-id&gt;
          </code>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <section className="rounded-lg border border-line bg-bg-subtle p-5">
          <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-4">
            Last hour activity
          </h2>
          {!shares && (
            <div className="text-sm text-ink-mute">stratum API unreachable</div>
          )}
          {shares && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-mute text-xs">Shares</dt>
                <dd className="font-mono text-ink mt-0.5">{shares.count}</dd>
              </div>
              <div>
                <dt className="text-ink-mute text-xs">Active members</dt>
                <dd className="font-mono text-ink mt-0.5">
                  {memberWeights.size}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="rounded-lg border border-line bg-bg-subtle p-5">
          <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-4">
            Top members (last hour)
          </h2>
          {leaderboard.length === 0 && (
            <div className="text-sm text-ink-mute">no shares yet</div>
          )}
          {leaderboard.length > 0 && (
            <ol className="space-y-1 text-xs font-mono">
              {leaderboard.map(([pk, weight], i) => (
                <li key={pk} className="flex justify-between gap-3">
                  <span className="text-ink-dim">
                    {i + 1}. {pk.slice(0, 10)}…
                  </span>
                  <span className="text-ink">{weight.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-line bg-bg-subtle p-5">
        <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-4">
          Recent blocks
        </h2>
        {!blocks && (
          <div className="text-sm text-ink-mute">stratum API unreachable</div>
        )}
        {blocks && blocks.count === 0 && (
          <div className="text-sm text-ink-mute">no blocks found yet</div>
        )}
        {blocks && blocks.count > 0 && (
          <ul className="space-y-2">
            {blocks.blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-baseline justify-between gap-3 text-xs font-mono"
              >
                <span className="text-ink">#{b.height}</span>
                <span className="text-ink-dim flex-1 truncate">
                  {b.hash.slice(0, 16)}…
                </span>
                <span className="text-ink-dim">{b.rewardSats} sats</span>
                <span
                  className={
                    b.status === "MATURED" || b.status === "PAID"
                      ? "text-accent"
                      : "text-ink-mute"
                  }
                >
                  {b.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
