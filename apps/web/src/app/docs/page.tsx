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
        ← back home
      </Link>

      <header className="mt-4 mb-12">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3">
          how it all works
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          The <span className="text-accent">docs</span>.
        </h1>
        <p className="mt-5 text-lg text-ink-dim leading-relaxed max-w-2xl">
          A directory of Bitcoin solo-mining dens. Find one, point your
          hardware at it, and chase blocks together. Payouts land directly
          in the coinbase, so there's no platform balance to trust.
        </p>
      </header>

      <section className="mb-20 grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <a
          href="#verify"
          className="group rounded-lg border border-line bg-bg-subtle p-6 hover:border-accent hover:bg-bg-elevated transition-colors"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mb-3">
            I want to
          </div>
          <div className="text-xl font-semibold text-ink mb-2">
            Verify I get paid
          </div>
          <div className="text-sm text-ink-dim leading-relaxed">
            Check, on your own hardware, that every block you mine actually pays
            your address.
          </div>
          <div className="mt-5 text-xs text-accent group-hover:underline">
            Read the steps →
          </div>
        </a>
      </section>

      <Section title="In a nutshell">
        <P>
          A directory of Bitcoin <em>solo-mining</em> groups — we call them
          dens. Operators run a den, miners point their hardware at it, and
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
              href={"/dens" as any}
              className="text-accent hover:underline"
            >
              the dens directory
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

      <Section title="Verify your payouts yourself" id="verify">
        <P>
          You don't have to trust the den — or this site — to pay you. Run{" "}
          <Code>hashden-verify</Code> between your miner and the den: it
          reconstructs the coinbase from the data every miner already receives
          and checks that <em>your</em> address is in it,{" "}
          <strong>before</strong> your hardware hashes the block. The check runs
          on your machine; the server is trusted for nothing.
        </P>
        <Steps>
          <Step n={1} title="Run the verifier">
            One command, no checkout — the image is cosign-signed and attested,
            so you can verify the verifier itself:
            <pre className="mt-3 rounded bg-bg-panel border border-line p-3 text-xs font-mono text-ink overflow-x-auto">
              {`docker run --rm -p 3333:3333 ghcr.io/theicaruswings/hashden-verify:main \\
  --den stratum.hashden.app:3333 \\
  --address bc1q...your-payout-address... \\
  --rule solo \\
  --listen 0.0.0.0:3333`}
            </pre>
            Run it anywhere your miner can reach — the same PC, a Raspberry Pi,
            or a small VPS. <Code>--address</Code> is the address you registered;
            it stays local.
          </Step>
          <Step n={2} title="Point your miner at it">
            Change your miner's pool URL to the verifier instead of the den,
            keeping the same worker name:
            <pre className="mt-3 rounded bg-bg-panel border border-line p-3 text-xs font-mono text-ink overflow-x-auto">
              {`Stratum URL:  <machine-running-verify>
Stratum port: 3333
Stratum user: <slug>.<your-npub>.<worker-name>`}
            </pre>
          </Step>
          <Step n={3} title="Watch every job">
            Each job the den sends is checked and logged:
            <pre className="mt-3 rounded bg-bg-panel border border-line p-3 text-xs font-mono text-ink overflow-x-auto">
              {`job 1a2b: ✓ OK   — Solo job pays your address 97.50% of the reward
job 1a2c: ✗ FAIL — your address is NOT among the coinbase outputs`}
            </pre>
            A <Code>✓</Code> means the block you're about to find pays you. Add{" "}
            <Code>--strict</Code> to stop mining the moment a bad job appears.
          </Step>
        </Steps>
        <P>
          <strong>Solo dens</strong> get a strong guarantee — the coinbase must
          pay your address ≈ the whole reward.{" "}
          <strong>PPLNS dens</strong> get a lighter check: your address must be
          present with a sane amount (the exact proportional split needs the
          den's off-chain share counts, which the tool deliberately doesn't
          trust). Source and details:{" "}
          <a
            href="https://github.com/TheIcarusWings/hashden/tree/main/apps/verifier"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            apps/verifier
          </a>
          .
        </P>
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

      <Section title="What's private and what isn't">
        <P>
          Hashden tries to expose the bare minimum needed to make a
          mining pool work. Here's what other members, operators, and
          random visitors can and can't see about you.
        </P>
        <div className="mt-3 space-y-3">
          <PrivacyRow
            label="IP address"
            visible="Nobody"
            note="The stratum never logs your IP or stores it in any table. Connection diagnostics use the random session id only."
          />
          <PrivacyRow
            label="Mining hardware (user-agent)"
            visible="Nobody"
            note="The stratum doesn't store your bitaxe/cpuminer fingerprint per-session. Aggregate hardware stats are anonymized."
          />
          <PrivacyRow
            label="Lightning address"
            visible="Platform only"
            note="Used server-side by dust fan-out. Never returned from any read API. Other members and the operator can't see it."
          />
          <PrivacyRow
            label="BTC payout address (before a block is found)"
            visible="Nobody"
            note="Coinbase previews show member share weights but redact the actual payout addresses. They only become visible on-chain, the moment a block is mined."
          />
          <PrivacyRow
            label="BTC payout address (after a block is found)"
            visible="Everyone (on-chain)"
            note="The coinbase transaction is public on the Bitcoin blockchain. Once the block is mined, every output is forever visible to anyone who looks at the chain."
          />
          <PrivacyRow
            label="Nostr pubkey (npub)"
            visible="Opt-in"
            note="Anonymized by default. Read endpoints (shares, payouts, blocks, coinbase preview) return a stable per-den id like `anon-1a2b3c4d` instead of your npub. Toggle to `public` per-den on /me to publish your npub against your contributions instead. The id is stable within a den so leaderboards keep working, but unlinkable across dens (same person → different ids in different dens)."
          />
        </div>
        <P>
          <strong>What the operator sees:</strong> exactly the same
          things any other visitor sees. There's no privileged
          "operator dashboard" that reveals member IPs, hardware, or
          lightning addresses — the den operator queries the same
          public API as everyone else.
        </P>
        <P>
          <strong>What the platform sees:</strong> the platform stores
          rows in Postgres for membership, shares, blocks, and payouts.
          The platform admin can read those rows directly (e.g. to
          debug a failed payout). This is a structural property of any
          hosted service. Plans to make this verifiable (operator-run
          stratum, members-as-relays) are on the roadmap, not in the
          alpha.
        </P>
        <P>
          <strong>What Nostr relays see:</strong> joining a den
          publishes a kind-30078 signed event with your pubkey and the
          den's slug. Anyone scanning relays can enumerate members of
          public dens regardless of what this site shows. Unlisted dens
          still publish the same event; "unlisted" only hides them
          from this site's directory.
        </P>
      </Section>

      <Section title="When things go wrong">
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-dim leading-relaxed">
          <li>
            <strong>Bitcoin node outage:</strong> if the platform's Bitcoin
            node goes unreachable, the stratum's circuit breaker kicks in
            and templates pause. Mining keeps queueing and picks back up
            once the node is reachable again.
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

function PrivacyRow({
  label,
  visible,
  note,
}: {
  label: string;
  visible: string;
  note: string;
}) {
  // Soft-color the "visible to" tag by sensitivity — green for nobody,
  // muted for platform-only / opt-in, accent for everyone — so the table
  // reads at a glance before the reader gets to the explanation.
  const tone =
    visible === "Nobody"
      ? "text-good"
      : visible === "Everyone" || visible.startsWith("Everyone")
        ? "text-accent"
        : "text-ink-dim";
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-4">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className={`text-[10px] uppercase tracking-wider ${tone}`}>
          visible to: {visible}
        </div>
      </div>
      <div className="text-xs text-ink-dim leading-relaxed">{note}</div>
    </div>
  );
}
