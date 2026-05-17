import Link from "next/link";
import { listGroups, type PublicGroup } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All dens · Hashden",
  description: "Every public Hashden den.",
};

export default async function DensPage() {
  let groups: PublicGroup[] = [];
  let groupsErr: string | null = null;
  try {
    groups = await listGroups();
  } catch (e) {
    groupsErr = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back home
      </Link>

      <header className="mt-3 mb-10 flex items-baseline justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">All dens</h1>
          <p className="mt-2 text-sm text-ink-dim">
            Every public den, fresh from the API.
          </p>
        </div>
        <span className="shrink-0 text-xs uppercase tracking-wider text-ink-mute">
          {groups.length} {groups.length === 1 ? "den" : "dens"}
        </span>
      </header>

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
            <DenCard key={g.slug} den={g} />
          ))}
        </ul>
      )}
    </main>
  );
}

function DenCard({ den }: { den: PublicGroup }) {
  return (
    <li>
      <Link
        href={`/g/${den.slug}` as any}
        prefetch={false}
        className="block rounded-lg border border-line bg-bg-subtle p-5 hover:border-accent hover:bg-bg-elevated transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-medium text-ink truncate">
            {den.name || den.slug}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-mute">
            {den.payoutRule === "SOLO_SHOWCASE" ? "solo" : "pplns"}
          </span>
        </div>
        {den.description && (
          <p className="mt-2 text-sm text-ink-dim line-clamp-2">
            {den.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-mute">
          <span>fee {(den.feeBps / 100).toFixed(2)}%</span>
          <span>·</span>
          <span className="font-mono truncate">
            op {den.operatorPubkey.slice(0, 8)}…
          </span>
        </div>
      </Link>
    </li>
  );
}
