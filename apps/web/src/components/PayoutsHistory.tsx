import { getGroupPayouts } from "@/lib/api";
import { MemberPubkeyLabel } from "@/components/MemberPubkeyLabel";

/**
 * Renders recent PayoutAttempt rows for a group. Each row shows the
 * member, amount, kind (on-chain coinbase or Lightning dust), status,
 * and a deep link to the kind-9735 zap receipt on njump.me when one
 * has been published — the audit trail for non-custodial mining.
 */
export async function PayoutsHistory({ slug }: { slug: string }) {
  let payouts: Awaited<ReturnType<typeof getGroupPayouts>> | null = null;
  try {
    payouts = await getGroupPayouts(slug, 25);
  } catch {
    return null;
  }
  if (!payouts || payouts.count === 0) {
    return (
      <section className="rounded-lg border border-line bg-bg-subtle p-5">
        <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-3">
          Recent payouts
        </h2>
        <div className="text-sm text-ink-mute">
          No payouts yet. They show up here as soon as the first block matures.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-bg-subtle p-5">
      <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-3">
        Recent payouts
      </h2>
      <ol className="space-y-1.5 text-xs font-mono">
        {payouts.payouts.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="text-ink-mute">#{p.blockHeight}</span>
            <span
              className={`text-[10px] uppercase tracking-wider ${kindClass(p.kind)}`}
            >
              {p.kind === "ON_CHAIN_COINBASE" ? "on-chain" : "ln dust"}
            </span>
            <span className="flex-1 truncate text-ink-dim">
              <MemberPubkeyLabel memberPubkey={p.memberPubkey} slug={slug} />
            </span>
            <span className="text-ink">{p.amountSats}</span>
            <span className={`text-[10px] ${statusClass(p.status)}`}>
              {p.status.toLowerCase()}
            </span>
            {p.zapEventId ? (
              <a
                href={`https://njump.me/${p.zapEventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-accent hover:underline"
                title="View zap receipt on njump.me"
              >
                ↗
              </a>
            ) : (
              <span className="text-[10px] text-ink-mute" title="No zap receipt yet">
                ·
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function kindClass(k: string): string {
  return k === "ON_CHAIN_COINBASE" ? "text-accent" : "text-ink-dim";
}

function statusClass(s: string): string {
  switch (s) {
    case "PAID":
      return "text-accent";
    case "FAILED":
      return "text-accent";
    case "IN_FLIGHT":
      return "text-ink-dim";
    case "PENDING":
      return "text-ink-mute";
    default:
      return "text-ink-mute";
  }
}
