import Link from "next/link";

export const metadata = {
  title: "Hashden — docs",
  description: "Operator + miner reference for Hashden.",
};

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to marketplace
      </Link>

      <header className="mt-3 mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Everything you need to run a den or join one. Open alpha — gaps and
          rough edges are expected; nudge the project npub if anything's off.
        </p>
      </header>

      <Section title="What Hashden is, in 30 seconds">
        <P>
          A marketplace of Bitcoin <em>solo-mining</em> groups (we call them
          dens). Operators run a den, miners point their hardware at it, and
          when the den finds a block, payouts go directly to each member's BTC
          address via the coinbase transaction itself. No platform balance,
          no operator IOU, no opaque ledger.
        </P>
        <P>
          Identity is Nostr (NIP-07 sign-in). Custody is on-chain. Operators
          take a fee they set themselves (basis points, baked into every
          coinbase). The platform takes a small fixed fee (50 bps).
        </P>
      </Section>

      <Section title="For miners — joining a den">
        <ol className="list-decimal pl-5 space-y-3 text-sm text-ink-dim leading-relaxed">
          <li>
            Install a NIP-07 signer (Alby, nos2x, or an iOS/Android Nostr app
            that supports remote signing).
          </li>
          <li>
            Browse{" "}
            <Link href={"/" as any} className="text-accent hover:underline">
              the marketplace
            </Link>{" "}
            and pick a den whose payout rule + fee + operator you trust.
          </li>
          <li>
            Click <Code>Join this den</Code> — you'll be prompted to sign a
            kind-30078 registration with your BTC address (the one that
            receives your share of any coinbase) and a Lightning address (the
            fallback for sub-dust amounts).
          </li>
          <li>
            Configure your hardware (Bitaxe, etc.) with:
            <pre className="mt-2 rounded bg-bg-panel border border-line p-3 text-xs font-mono text-ink overflow-x-auto">
              {`Stratum URL:  stratum.hashden.app
Stratum port: 3333
Stratum user: <slug>.<your-pubkey-hex>.<worker-name>
Stratum pass: x   (anything; not validated)`}
            </pre>
            The pubkey must be the <em>hex</em> form (64 chars, no <Code>npub1…</Code> prefix).
          </li>
          <li>
            Watch your shares appear in real time on the den's page. When a
            block is found, the celebration banner appears above the
            description.
          </li>
        </ol>
      </Section>

      <Section title="For operators — running a den">
        <ol className="list-decimal pl-5 space-y-3 text-sm text-ink-dim leading-relaxed">
          <li>
            Sign in with NIP-07 and click{" "}
            <Link
              href={"/new" as any}
              className="text-accent hover:underline"
            >
              Create a den
            </Link>
            . Pick a slug, fee (basis points: 200 = 2%), and payout rule
            (solo-showcase or PPLNS — see below). Your BTC address gets
            operator-fee + dust-bucket coinbase outputs; pick one you control
            ideally a hardware wallet.
          </li>
          <li>
            <strong>Template source:</strong> default to{" "}
            <Code>PLATFORM_DEFAULT</Code> (Hashden's Bitcoin Knots node).
            Switch to <Code>OPERATOR_RPC</Code> if you want to run your own
            policy (DATUM, Libre Relay, custom Knots config). You'll paste an
            RPC URL + auth; we encrypt the credential at rest.
          </li>
          <li>
            <strong>Lightning credentials</strong> (optional but recommended):
            for PPLNS dens, members below the on-chain dust threshold get
            paid via Lightning from your wallet. Paste an LNbits admin key or
            an NWC connection string. Encrypted at rest with a key the
            platform alone holds.
          </li>
          <li>
            Share your den's URL with miners. They onboard via the join flow
            above.
          </li>
        </ol>
      </Section>

      <Section title="Payout rules — solo-showcase vs PPLNS">
        <P>
          <strong>Solo-showcase</strong> is "winner takes the block, minus
          fees." If your hardware finds the block, you get the whole reward
          (~3.125 BTC at current subsidy) minus the operator's fee and the
          0.5% platform fee. The other members of the den get nothing for
          that block; they're showcasing the den, not splitting the reward.
          Best for hobbyist groups where finding a block at all is the win.
        </P>
        <P>
          <strong>PPLNS</strong> (pay per last N shares) splits the reward
          among everyone whose shares contributed to a recent window — your
          weight = your share count. Above-dust amounts go on-chain in the
          coinbase; sub-dust amounts get paid in Lightning shortly after the
          block matures. Best for serious mining groups.
        </P>
        <P>
          Either way, the on-chain coinbase is the source of truth. Anyone
          can verify on-chain who got what — no platform-side ledger to trust.
        </P>
      </Section>

      <Section title="What happens when a block is found">
        <ol className="list-decimal pl-5 space-y-2 text-sm text-ink-dim leading-relaxed">
          <li>
            Stratum routes the winning share + builds the coinbase tx with
            the right outputs (winner / PPLNS members / op fee / platform
            fee / dust bucket).
          </li>
          <li>
            The block is broadcast. Hashden records it as <Code>FOUND</Code>.
          </li>
          <li>
            After 100 confirmations (~16h on average), the maturity watcher
            promotes it to <Code>MATURED</Code>. On-chain coinbase outputs
            are now spendable by their recipients — no further action from
            anyone.
          </li>
          <li>
            For PPLNS: the dust-fanout worker pays each below-dust member via
            the operator's Lightning wallet. Hashden writes a NIP-57 zap
            receipt for each payment as a public audit trail.
          </li>
          <li>
            If the block is reorged out before maturity, status flips to{" "}
            <Code>ORPHANED</Code>. No payouts happen for an orphaned block —
            the mainchain block from the same height is the one that paid
            (probably another pool).
          </li>
        </ol>
      </Section>

      <Section title="Costs">
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-dim leading-relaxed">
          <li>
            <strong>Platform fee:</strong> 50 bps (0.5%) of every block reward,
            sent to a multisig cold address controlled by the project.
          </li>
          <li>
            <strong>Operator fee:</strong> set by the operator at den creation
            (typical 1–3%). Sent to the operator's BTC address as a coinbase
            output on every block.
          </li>
          <li>
            <strong>Lightning fees:</strong> any routing fees for dust fan-out
            come out of the dust bucket itself, not the recipient's share.
          </li>
          <li>
            <strong>Stratum / API / hosting:</strong> free for users. Operating
            costs are paid by the platform fee above.
          </li>
        </ul>
      </Section>

      <Section title="Failure modes you should know about">
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-dim leading-relaxed">
          <li>
            <strong>Tailscale / RPC outage:</strong> if the platform's Bitcoin
            node becomes unreachable, stratum's circuit breaker falls back
            and templates pause. Mining keeps queueing; resumes when RPC
            recovers.
          </li>
          <li>
            <strong>Operator's LN wallet down:</strong> dust fan-out for that
            operator's dens stalls. Reconcile-on-restart catches partial
            payments. No double-pays.
          </li>
          <li>
            <strong>Block reorged:</strong> very rare. We mark the block{" "}
            <Code>ORPHANED</Code> and skip payouts. Members got nothing for
            that height; the chain reorganized them out.
          </li>
          <li>
            <strong>Lightning address dead:</strong> dust payments fail and
            stay <Code>FAILED</Code> in the audit trail. Member can update
            their address by re-running the join flow.
          </li>
          <li>
            <strong>Knots policy divergence:</strong> the platform's default
            template comes from Knots. If Knots changes its tx filters in a
            way you disagree with, switch your den to <Code>OPERATOR_RPC</Code>{" "}
            and run your own node policy.
          </li>
        </ul>
      </Section>

      <Section title="Help / contact">
        <P>
          Issues, bug reports, feature requests: DM the project on Nostr at{" "}
          <a
            href="https://primal.net/p/npub13uw3c3k6ahe5wkx9c3jxaslmzp8apwde75raw6nfch8nmeaferxqv3d5ry"
            className="text-accent hover:underline font-mono"
          >
            npub13uw…d5ry
          </a>
          {" "}or open an issue on{" "}
          <a
            href="https://github.com/TheIcarusWings/hashden"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
          . This is open alpha — a single-operator project — replies may take
          a day or two.
        </P>
      </Section>
    </main>
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
    <section className="mb-12">
      <h2 className="text-xl font-semibold tracking-tight mb-4 text-ink">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ink-dim leading-relaxed">{children}</p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-bg-panel border border-line px-1.5 py-0.5 text-xs font-mono text-ink-dim">
      {children}
    </code>
  );
}
