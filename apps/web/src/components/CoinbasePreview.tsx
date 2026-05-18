import { getCoinbasePreview } from "@/lib/api";
import { MemberPubkeyLabel } from "@/components/MemberPubkeyLabel";

/**
 * Server-rendered "if a block were found right now" coinbase output
 * preview. PPLNS groups: shows weighted member outputs + dust bucket +
 * fees. Solo-showcase: shows the most recent miner as the projected
 * winner (since per-miner templates make a true "winner" only knowable
 * post-find).
 */
export async function CoinbasePreview({ slug }: { slug: string }) {
  let preview: Awaited<ReturnType<typeof getCoinbasePreview>> | null = null;
  let error: string | null = null;
  try {
    preview = await getCoinbasePreview(slug);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <Section title="Coinbase preview">
        <div className="text-xs text-ink-mute">unavailable: {error}</div>
      </Section>
    );
  }
  if (!preview) return null;

  const reward = BigInt(preview.blockRewardSats);
  const rewardBtc = (Number(reward) / 1e8).toFixed(8);

  if (preview.outputs.length === 0) {
    return (
      <Section title="Coinbase preview">
        <div className="text-sm text-ink-dim">{preview.note}</div>
      </Section>
    );
  }

  return (
    <Section title="Coinbase preview">
      <div className="text-xs text-ink-mute mb-3">
        if a block were found right now ({rewardBtc} BTC reward) ·{" "}
        <span className="text-ink-dim">{preview.note}</span>
      </div>
      <ol className="space-y-1.5 text-xs font-mono">
        {preview.outputs.map((o, i) => {
          const pct = ((Number(o.sats) / Number(reward)) * 100).toFixed(2);
          return (
            <li
              key={`${o.kind}-${i}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span
                className={`text-[10px] uppercase tracking-wider ${kindColor(o.kind)}`}
              >
                {kindLabel(o.kind)}
              </span>
              <span className="flex-1 truncate text-ink-dim">
                {o.memberPubkey ? (
                  <MemberPubkeyLabel memberPubkey={o.memberPubkey} slug={slug} />
                ) : o.address ? (
                  o.address.slice(0, 16) + "…"
                ) : (
                  "hidden until block found"
                )}
              </span>
              <span className="text-ink">{o.sats}</span>
              <span className="text-ink-mute">{pct}%</span>
            </li>
          );
        })}
      </ol>
      {preview.dustBreakdown.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-mute mb-2">
            Dust bucket → operator fans out via Lightning
          </div>
          <ol className="space-y-1 text-xs font-mono">
            {preview.dustBreakdown.map((d) => (
              <li key={d.memberPubkey} className="flex justify-between gap-3">
                <span className="text-ink-dim">
                  <MemberPubkeyLabel memberPubkey={d.memberPubkey} slug={slug} />
                </span>
                <span className="text-ink">{d.owedSats}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-bg-subtle p-5">
      <h2 className="text-sm uppercase tracking-wider text-ink-mute mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function kindLabel(k: string): string {
  switch (k) {
    case "MEMBER":
      return "member";
    case "OPERATOR_FEE":
      return "op fee";
    case "PLATFORM_FEE":
      return "platform";
    case "DUST_BUCKET":
      return "dust";
    default:
      return k.toLowerCase();
  }
}

function kindColor(k: string): string {
  switch (k) {
    case "MEMBER":
      return "text-accent";
    case "OPERATOR_FEE":
      return "text-ink-dim";
    case "PLATFORM_FEE":
      return "text-ink-mute";
    case "DUST_BUCKET":
      return "text-ink-mute";
    default:
      return "text-ink-mute";
  }
}
