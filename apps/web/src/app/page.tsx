import Link from "next/link";
import { listGroups, type PublicGroup } from "@/lib/api";

export default async function HomePage() {
  let groups: PublicGroup[] = [];
  let groupsErr: string | null = null;
  try {
    groups = await listGroups();
  } catch (e) {
    groupsErr = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <header className="mb-16">
        <div className="flex items-center gap-3 text-ink-mute text-xs uppercase tracking-[0.2em]">
          <span className="h-px flex-1 bg-line" />
          <span>open alpha · expect rough edges</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      </header>

      <section className="space-y-8">
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          A <span className="text-accent">den</span> of solo miners.
        </h1>

        <p className="max-w-2xl text-lg text-ink-dim leading-relaxed">
          Hashden is a marketplace of Bitcoin solo-mining groups. Find a den
          you like, point your Bitaxe at it, and go chase a block together.
          Payouts go straight into the coinbase, so there's no platform
          balance sitting in the middle and no PPLNS ledger you have to
          trust someone about.
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <Link
            href={"/new" as any}
            className="rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Create a den →
          </Link>
          <a
            href="#marketplace"
            className="rounded-md border border-line px-5 py-3 text-sm font-medium hover:border-ink-mute transition-colors"
          >
            Browse the marketplace
          </a>
          <Link
            href={"/docs" as any}
            className="rounded-md border border-line px-5 py-3 text-sm font-medium hover:border-ink-mute transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </section>

      <section id="marketplace" className="mt-24 scroll-mt-8">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">Active dens</h2>
          <span className="text-xs uppercase tracking-wider text-ink-mute">
            {groups.length} {groups.length === 1 ? "den" : "dens"}
          </span>
        </div>
        {groupsErr ? (
          <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-mute">
            Couldn't reach the API right now. Try again in a moment.
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-mute">
            No dens here yet. Be the first to{" "}
            <Link href={"/new" as any} className="text-accent hover:underline">
              create one
            </Link>
            .
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/g/${g.slug}` as any}
                  className="block rounded-lg border border-line bg-bg-subtle p-5 hover:border-accent hover:bg-bg-elevated transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium text-ink truncate">
                      {g.name || g.slug}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-mute">
                      {g.payoutRule === "SOLO_SHOWCASE" ? "solo" : "pplns"}
                    </span>
                  </div>
                  {g.description && (
                    <p className="mt-2 text-sm text-ink-dim line-clamp-2">
                      {g.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-ink-mute">
                    <span>fee {(g.feeBps / 100).toFixed(2)}%</span>
                    <span>·</span>
                    <span className="font-mono truncate">
                      op {g.operatorPubkey.slice(0, 8)}…
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat label="Mining model" value="Solo-showcase + PPLNS" />
        <Stat label="Custody" value="Operator + on-chain" hint="never the platform" />
        <Stat label="Identity" value="Nostr (NIP-07)" hint="bring your own keys" />
      </section>

      <footer className="mt-32 pt-8 border-t border-line text-xs text-ink-mute space-y-2">
        <p>
          Open alpha, so expect bugs. If something breaks or you have
          feedback, DM me on Nostr at{" "}
          <a
            href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
            className="text-ink-dim hover:text-accent transition-colors font-mono"
          >
            npub19tz…jvq5
          </a>
          {" "}or open an issue on{" "}
          <a
            href="https://github.com/TheIcarusWings/hashden"
            className="text-ink-dim hover:text-accent transition-colors"
          >
            GitHub
          </a>
          . Live{" "}
          <Link href={"/status" as any} className="text-ink-dim hover:text-accent transition-colors">
            status here
          </Link>
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
