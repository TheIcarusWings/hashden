import Link from "next/link";
import { listGroups, type PublicGroup } from "@/lib/api";

// Force dynamic so each request hits the API fresh — without this, Next
// might statically render the home at build time and freeze the den list.
export const dynamic = "force-dynamic";

// Home preview shows at most this many dens; the full list lives at
// /dens. Keeps the landing focused on the pitch.
const HOME_DEN_PREVIEW_CAP = 8;

export default async function HomePage() {
  let allGroups: PublicGroup[] = [];
  let groupsErr: string | null = null;
  try {
    allGroups = await listGroups();
  } catch (e) {
    groupsErr = (e as Error).message;
  }
  const groups = allGroups.slice(0, HOME_DEN_PREVIEW_CAP);
  const totalGroups = allGroups.length;
  const hasMore = totalGroups > groups.length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <section className="space-y-8">
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          A <span className="text-accent">den</span> of solo miners.
        </h1>

        <p className="max-w-2xl text-lg text-ink-dim leading-relaxed">
          Hashden is a directory of Bitcoin solo-mining dens. Find one you
          like, point your Bitaxe at it, and go chase a block together.
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
          <Link
            href={"/dens" as any}
            className="rounded-md border border-line px-5 py-3 text-sm font-medium hover:border-ink-mute transition-colors"
          >
            Browse dens
          </Link>
          <Link
            href={"/docs" as any}
            className="rounded-md border border-line px-5 py-3 text-sm font-medium hover:border-ink-mute transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </section>

      <section className="mt-24">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">Active dens</h2>
          <span className="text-xs uppercase tracking-wider text-ink-mute">
            {hasMore
              ? `${groups.length} of ${totalGroups}`
              : `${groups.length} ${groups.length === 1 ? "den" : "dens"}`}
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
          <>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/g/${g.slug}` as any}
                    prefetch={false}
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
            {hasMore && (
              <div className="mt-6">
                <Link
                  href={"/dens" as any}
                  className="text-sm text-ink-dim hover:text-accent transition-colors"
                >
                  See all {totalGroups} dens →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Pitch
          title="Bitcoin pays you, not us"
          body="Your share goes straight into the block's coinbase transaction. The platform never holds your funds, and there's no pool ledger to trust."
        />
        <Pitch
          title="You keep your keys"
          body="Sign in with any Nostr signer (Alby, nos2x, NIP-46). No email, no account, no password. Your npub is your identity."
        />
        <Pitch
          title="Anonymous by default"
          body="We don't log your IP, don't store your hardware fingerprint, and don't expose your payout address until you've actually mined a block. Other members and the operator see the same."
        />
        <Pitch
          title="Pick a den that fits"
          body="Some dens give the full block to whoever wins (solo-showcase). Others split it across recent share contributors (PPLNS). Each operator picks."
        />
      </section>

      <footer className="mt-32 pt-8 border-t border-line text-xs text-ink-mute space-y-2">
        <p>
          Open alpha, so expect bugs. If something breaks or you have
          feedback, DM me on Nostr at{" "}
          <a
            href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
            className="text-ink-dim hover:text-accent transition-colors"
          >
            @icaruswings
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

function Pitch({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-subtle p-5">
      <div className="text-base font-semibold text-ink leading-snug">
        {title}
      </div>
      <p className="mt-2 text-sm text-ink-dim leading-relaxed">{body}</p>
    </div>
  );
}
