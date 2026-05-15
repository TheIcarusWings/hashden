import Link from "next/link";

export const metadata = {
  title: "Hashden docs",
  description: "How to run a den, or how to join one.",
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

      <header className="mt-4 mb-12">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3">
          how it all works
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          The <span className="text-accent">docs</span>.
        </h1>
        <p className="mt-5 text-lg text-ink-dim leading-relaxed max-w-2xl">
          A marketplace of Bitcoin solo-mining groups. Find a den, point
          your hardware at it, and chase blocks together. Payouts land
          directly in the coinbase, so there's no platform balance to trust.
        </p>
      </header>

      <section className="mb-20 grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="#miner"
          className="group rounded-lg border border-line bg-bg-subtle p-6 hover:border-accent hover:bg-bg-elevated transition-colors"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mb-3">
            I want to
          </div>
          <div className="text-xl font-semibold text-ink mb-2">
            Mine in a den
          </div>
          <div className="text-sm text-ink-dim leading-relaxed">
            Pick a den, plug in your Bitaxe, get your share of every block it
            finds.
          </div>
          <div className="mt-5 text-xs text-accent group-hover:underline">
            Read the steps →
          </div>
        </a>
        <a
          href="#operator"
          className="group rounded-lg border border-line bg-bg-subtle p-6 hover:border-accent hover:bg-bg-elevated transition-colors"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mb-3">
            I want to
          </div>
          <div className="text-xl font-semibold text-ink mb-2">
            Run my own den
          </div>
          <div className="text-sm text-ink-dim leading-relaxed">
            Spin up a group with your own fee, payout rule, and (optionally)
            node policy.
          </div>
          <div className="mt-5 text-xs text-accent group-hover:underline">
            Read the steps →
          </div>
        </a>
      </section>

      <Section title="In a nutshell">
        <P>
          A marketplace of Bitcoin <em>solo-mining</em> groups (we call them
          dens). Operators run a den, miners point their hardware at it, and
          when the den finds a block, payouts land in each member's BTC
          address directly through the coinbase transaction.
        </P>
        <P>
          No platform balance. No operator IOU. No opaque ledger. Identity is
          Nostr (NIP-07 sign-in). Custody is on-chain. Operators pick their
          own fee. The platform takes 0.5% on top, written into every
          coinbase.
        </P>
      </Section>

      <Section title="Mining in a den" id="miner">
        <P>
          Four steps from "I want to mine" to "I'm mining". You need a Nostr
          signer and any stratum-compatible hardware.
        </P>
        <Steps>
          <Step n={1} title="Get a Nostr signer">
            Install a NIP-07 signer. On desktop that's{" "}
            <a
              href="https://getalby.com"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Alby
            </a>{" "}
            or{" "}
            <a
              href="https://github.com/fiatjaf/nos2x"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              nos2x
            </a>
            . On mobile, anything that supports NIP-46 remote signing.
          </Step>
          <Step n={2} title="Pick a den you like">
            Browse{" "}
            <Link
              href={"/" as any}
              className="text-accent hover:underline"
            >
              the marketplace
            </Link>{" "}
            and find one whose payout rule, fee, and operator you trust.
          </Step>
          <Step n={3} title="Register">
            Click <Code>Join this den</Code> and sign a kind-30078
            registration with your BTC address (where your share of any
            coinbase lands) and a Lightning address (used when your share is
            too small to send on-chain).
          </Step>
          <Step n={4} title="Point your hardware">
            Plug these into your Bitaxe (or whatever stratum client you use):
            <pre className="mt-3 rounded bg-bg-panel border border-line p-3 text-xs font-mono text-ink overflow-x-auto">
              {`Stratum URL:  stratum.hashden.app
Stratum port: 3333
Stratum user: <slug>.<your-npub>.<worker-name>
Stratum pass: x   (anything; not validated)`}
            </pre>
            Your <Code>npub1…</Code> is the bech32 public key shown in any
            Nostr client (also accepted in 64-char hex form). Shares show
            up live on the den's page.
          </Step>
        </Steps>
      </Section>

      <Section title="Running a den" id="operator">
        <P>
          Operators run the den, set the rules, and decide where the block
          templates come from. Members join, mine, and get paid through the
          coinbase. No funds touch you.
        </P>
        <Steps>
          <Step n={1} title="Sign in and create the den">
            Sign in with NIP-07 and open{" "}
            <Link
              href={"/new" as any}
              className="text-accent hover:underline"
            >
              Create a den
            </Link>
            . You pick a slug, a fee (basis points, so 200 = 2%), and a
            payout rule (solo-showcase or PPLNS, see below). Your BTC
            address gets the operator fee and the dust-bucket outputs, so
            use one you control. Ideally a hardware wallet.
          </Step>
          <Step n={2} title="Pick a template source">
            Leave <Code>PLATFORM_DEFAULT</Code> on (Hashden's Bitcoin Knots
            node) unless you want to run your own policy. Switch to{" "}
            <Code>OPERATOR_RPC</Code> for DATUM, Libre Relay, a custom Knots
            config, whatever. Paste an RPC URL and auth. We encrypt the
            credential at rest.
          </Step>
          <Step n={3} title="Add a Lightning wallet (optional)">
            Recommended for PPLNS dens. Members whose share is too small to
            send on-chain get paid in Lightning from your wallet. Paste an
            LNbits admin key or an NWC connection string. Encrypted at rest.
          </Step>
          <Step n={4} title="Invite miners">
            Share your den's URL. Miners onboard through the steps above.
          </Step>
        </Steps>
      </Section>

      <Section title="Payout rules">
        <P>
          Two flavours. Pick one when you create the den. You can change it
          later in settings.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <RuleCard
            label="Solo-showcase"
            tag="winner takes the block"
            body={
              <>
                If your hardware finds the block, you get the full reward
                (~3.125 BTC at current subsidy), minus the operator's fee
                and the 0.5% platform fee. The rest of the den gets nothing
                for that block. They're there to showcase the den, not split
                the reward. Good fit for hobbyist groups where finding a
                block at all is the whole point.
              </>
            }
          />
          <RuleCard
            label="PPLNS"
            tag="pay per last N shares"
            body={
              <>
                The reward splits across everyone whose shares landed in a
                recent window. Your weight = your share count. Above-dust
                amounts go on-chain in the coinbase. Sub-dust amounts get
                paid in Lightning shortly after the block matures. Good fit
                for groups that take it more seriously.
              </>
            }
          />
        </div>
        <P>
          Either way, the on-chain coinbase is the source of truth. Anyone
          can check who got what on-chain, and there's no platform-side
          ledger to trust.
        </P>
      </Section>

      <Section title="What happens after a block">
        <Steps>
          <Step n={1} title="Coinbase gets built">
            The stratum routes the winning share and builds the coinbase
            with the right outputs: winner, PPLNS members, operator fee,
            platform fee, and the dust bucket.
          </Step>
          <Step n={2} title="Block is broadcast">
            Hashden records it as <Code>FOUND</Code>. The celebration banner
            appears on the den page.
          </Step>
          <Step n={3} title="It matures">
            After 100 confirmations (~16h on average), the maturity watcher
            flips status to <Code>MATURED</Code>. On-chain outputs are now
            spendable by their recipients. Nothing else needs to happen.
          </Step>
          <Step n={4} title="Dust gets fanned out">
            For PPLNS dens, the dust-fanout worker pays each below-dust
            member via the operator's Lightning wallet. Hashden writes a
            NIP-57 zap receipt for every payment as a public audit trail.
          </Step>
          <Step n={5} title="(Rarely) reorg">
            If the block gets reorged out before maturity, status flips to{" "}
            <Code>ORPHANED</Code>. No payouts happen for that block. The
            block at the same height on the new mainchain is the one that
            paid (probably another pool).
          </Step>
        </Steps>
      </Section>

      <Section title="What it costs">
        <div className="space-y-3">
          <Cost
            label="Platform fee"
            value="0.5%"
            body="Of every block reward. Sent to a multisig cold address the project controls."
          />
          <Cost
            label="Operator fee"
            value="set by operator"
            body="Picked at den creation, usually 1 to 3%. Goes to the operator's BTC address as a coinbase output."
          />
          <Cost
            label="Lightning fees"
            value="come out of dust"
            body="Routing fees for dust fan-out come out of the dust bucket itself, not anyone's share."
          />
          <Cost
            label="Stratum / API / hosting"
            value="free"
            body="Running costs are covered by the platform fee."
          />
        </div>
      </Section>

      <Section title="When things go wrong">
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-dim leading-relaxed">
          <li>
            <strong>Tailscale / RPC outage:</strong> if the platform's
            Bitcoin node goes unreachable, the stratum's circuit breaker
            kicks in and templates pause. Mining keeps queueing and picks
            back up when RPC recovers.
          </li>
          <li>
            <strong>Operator's LN wallet down:</strong> dust fan-out for
            that operator's dens stalls. Reconcile-on-restart catches
            partial payments. No double-pays.
          </li>
          <li>
            <strong>Block reorged:</strong> very rare. The block goes{" "}
            <Code>ORPHANED</Code> and payouts skip. Nobody got paid for that
            height because the chain reorganized them out.
          </li>
          <li>
            <strong>Lightning address dead:</strong> dust payments fail and
            stay <Code>FAILED</Code> in the audit trail. The member can fix
            their address by re-running the join flow.
          </li>
          <li>
            <strong>Knots policy divergence:</strong> the platform's default
            template comes from Knots. If Knots changes its tx filters in a
            way you disagree with, switch your den to{" "}
            <Code>OPERATOR_RPC</Code> and run your own node policy.
          </li>
        </ul>
      </Section>

      <section className="mt-20 rounded-lg border border-accent/30 bg-accent/5 p-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink mb-2">
          Get in touch
        </h2>
        <p className="text-sm text-ink-dim leading-relaxed">
          Bugs, ideas, weird edge cases, or just want to say hi: DM me on
          Nostr at{" "}
          <a
            href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
            className="text-accent hover:underline"
          >
            @icaruswings
          </a>
          {" "}or open an issue on{" "}
          <a
            href="https://github.com/TheIcarusWings/hashden"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
          . It's open alpha and a one-person project, so replies may take a
          day or two.
        </p>
      </section>
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-8">
      <h2 className="text-2xl font-semibold tracking-tight mb-5 text-ink">
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

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-4 space-y-5">{children}</ol>;
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full border border-accent/40 bg-accent/5 text-accent text-xs font-medium flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-medium text-ink mb-1">{title}</div>
        <div className="text-sm text-ink-dim leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function RuleCard({
  label,
  tag,
  body,
}: {
  label: string;
  tag: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-5">
      <div className="text-base font-semibold text-ink">{label}</div>
      <div className="text-[10px] uppercase tracking-wider text-accent mb-3">
        {tag}
      </div>
      <div className="text-sm text-ink-dim leading-relaxed">{body}</div>
    </div>
  );
}

function Cost({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-4 flex items-start gap-4">
      <div className="shrink-0 w-32">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-accent font-mono mt-0.5">{value}</div>
      </div>
      <div className="flex-1 text-sm text-ink-dim leading-relaxed">{body}</div>
    </div>
  );
}
