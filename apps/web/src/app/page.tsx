import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <header className="mb-16">
        <div className="flex items-center gap-3 text-ink-mute text-xs uppercase tracking-[0.2em]">
          <span className="h-px flex-1 bg-line" />
          <span>private alpha · invite only</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      </header>

      <section className="space-y-8">
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          A <span className="text-accent">den</span> of solo miners.
        </h1>

        <p className="max-w-2xl text-lg text-ink-dim leading-relaxed">
          Hashden is a marketplace of Bitcoin solo-mining groups. Join a den
          with people you trust, point your Bitaxe at it, and find blocks
          together — non-custodially, with payouts written into the
          coinbase itself. No platform balance to drain, no opaque PPLNS
          ledger you have to take on faith.
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <Link
            href={"/new" as any}
            className="rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Create a den →
          </Link>
          <Link
            href={"/" as any}
            className="rounded-md border border-line px-5 py-3 text-sm font-medium hover:border-ink-mute transition-colors"
          >
            Browse the marketplace
          </Link>
        </div>
      </section>

      <section className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat label="Mining model" value="Solo-showcase + PPLNS" />
        <Stat label="Custody" value="Operator + on-chain" hint="never the platform" />
        <Stat label="Identity" value="Nostr (NIP-07)" hint="bring your own keys" />
      </section>

      <footer className="mt-32 pt-8 border-t border-line text-xs text-ink-mute">
        <p>
          Hashden is in private alpha. Source on{" "}
          <a
            href="https://github.com/TheIcarusWings/hashden"
            className="text-ink-dim hover:text-accent transition-colors"
          >
            GitHub
          </a>
          .
        </p>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-5">
      <div className="text-xs uppercase tracking-wider text-ink-mute">
        {label}
      </div>
      <div className="mt-2 text-base font-medium text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-mute">{hint}</div>}
    </div>
  );
}
