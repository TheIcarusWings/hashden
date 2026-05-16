import Link from "next/link";

export default function GroupNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3">
        404
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-4">
        Den not found.
      </h1>
      <p className="text-sm text-ink-dim leading-relaxed mb-8">
        This den doesn't exist, or it may have been removed. If you got here
        from a link the operator shared, double-check the URL.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href={"/" as any}
          className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
        >
          Back to dens
        </Link>
        <Link
          href={"/docs" as any}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-ink-mute transition-colors"
        >
          Read the docs
        </Link>
      </div>
    </main>
  );
}
