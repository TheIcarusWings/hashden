import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getGroup,
  getGroupBlocks,
  getGroupShares,
} from "@/lib/api";
import { HASHDEN_STRATUM_URL } from "@/lib/env";
import { OperatorBadge } from "@/components/OperatorBadge";
import { CoinbasePreview } from "@/components/CoinbasePreview";
import { PayoutsHistory } from "@/components/PayoutsHistory";
import { MemberPubkeyLabel } from "@/components/MemberPubkeyLabel";
import { HashrateChart } from "@/components/HashrateChart";
import { AutoRefresh } from "@/components/AutoRefresh";
import {
  DenHeaderCta,
  MembershipBanner,
  WorkerUsernameHint,
} from "@/components/DenMembershipStatus";

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
        ← back to dens
      </Link>

      <div className="mt-3">
        <MembershipBanner
          slug={slug}
          operatorPubkey={group.operatorPubkey}
        />
      </div>

      <header className="mb-12 flex items-end justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-2 flex items-center gap-2 flex-wrap">
            <span>
              {group.payoutRule === "SOLO_SHOWCASE" ? "Solo showcase" : "PPLNS"}
            </span>
            <span>·</span>
            <span>{(group.feeBps / 100).toFixed(2)}% fee</span>
            <span>·</span>
            <span>
              {group.templateSource === "OPERATOR_RPC"
                ? "operator template"
                : "platform template"}
            </span>
            {group.payoutRule === "PPLNS" && (
              <>
                <span>·</span>
                <span>
                  dust ≤ {Number(group.dustThresholdSats).toLocaleString()} sats
                </span>
              </>
            )}
            {group.visibility === "UNLISTED" && (
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] tracking-wider text-accent">
                unlisted
              </span>
            )}
            <span>·</span>
            <AutoRefresh seconds={30} />
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {group.name}
          </h1>
          <div className="mt-4">
            <Suspense
              fallback={
                <div className="inline-block h-12 w-48 rounded-md border border-line bg-bg-panel" />
              }
            >
              <OperatorBadge pubkey={group.operatorPubkey} />
            </Suspense>
          </div>
        </div>
        <DenHeaderCta slug={slug} operatorPubkey={group.operatorPubkey} />
      </header>

      {/* Block-found celebration banner. Shows the most-recent block with
          status, age, and reward. The first real mainnet block this group
          mines deserves more than a row in a table — it's the whole point. */}
      {blocks && blocks.count > 0 && (() => {
        const latest = blocks.blocks[0];
        const ageMs = Date.now() - new Date(latest.foundAt).getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const ageHours = Math.floor(ageMs / (1000 * 60 * 60)) % 24;
        const ageMinutes = Math.floor(ageMs / (1000 * 60)) % 60;
        const age = ageDays > 0
          ? `${ageDays}d${ageHours > 0 ? ` ${ageHours}h` : ""} ago`
          : ageHours > 0
            ? `${ageHours}h${ageMinutes > 0 ? ` ${ageMinutes}m` : ""} ago`
            : `${ageMinutes}m ago`;
        const rewardBtc = (Number(latest.rewardSats) / 1e8).toFixed(4);
        const isMatured = latest.status === "MATURED" || latest.status === "DUST_FANNED_OUT";
        const isOrphaned = latest.status === "ORPHANED";
        return (
          <section
            className={`mb-10 rounded-lg border p-5 ${
              isOrphaned
                ? "border-line bg-bg-subtle"
                : "border-accent/40 bg-accent/5"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-accent">
                  {isOrphaned ? "Block reorged" : isMatured ? "Block matured" : "Block found"}
                </span>
                <span className="text-xs text-ink-mute">{age}</span>
              </div>
              <span className="text-xs text-ink-mute font-mono">
                #{latest.height.toLocaleString()}
              </span>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-ink">
              {rewardBtc} BTC <span className="text-base text-ink-dim">paid via coinbase</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-mute">
              <a
                href={`https://mempool.space/block/${latest.hash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-accent transition-colors truncate max-w-md"
              >
                {latest.hash.slice(0, 16)}…{latest.hash.slice(-8)} ↗
              </a>
              {isMatured && (
                <span className="text-accent">· payouts have shipped</span>
              )}
              {!isMatured && !isOrphaned && (
                <span>· maturing (need ≥100 confirmations)</span>
              )}
            </div>
          </section>
        );
      })()}

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
          <WorkerUsernameHint
            slug={slug}
            operatorPubkey={group.operatorPubkey}
          />
        </div>
      </section>

      <div className="mb-6">
        <Suspense
          fallback={
            <div className="rounded-lg border border-line bg-bg-subtle/40 p-5 h-40" />
          }
        >
          <HashrateChart slug={slug} />
        </Suspense>
      </div>

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
              <div>
                <dt className="text-ink-mute text-xs">Workers</dt>
                <dd className="font-mono text-ink mt-0.5">
                  {shares.workerCount}
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
                    {i + 1}.{" "}
                    <MemberPubkeyLabel memberPubkey={pk} slug={slug} />
                  </span>
                  <span className="text-ink">{weight.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <Suspense
          fallback={
            <div className="rounded-lg border border-line bg-bg-subtle/40 p-5 h-40" />
          }
        >
          <CoinbasePreview slug={slug} />
        </Suspense>
        <Suspense
          fallback={
            <div className="rounded-lg border border-line bg-bg-subtle/40 p-5 h-40" />
          }
        >
          <PayoutsHistory slug={slug} />
        </Suspense>
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
