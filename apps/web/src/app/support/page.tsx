import Link from "next/link";
import { btcpayConfigured } from "@/lib/btcpay";
import { SupportForm } from "@/components/SupportForm";

export const metadata = {
  title: "Support Hashden",
  description:
    "Voluntary tip to keep Hashden running — the stratum, the API, the marketplace. Pay over Lightning or on-chain.",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thanks?: string }>;
}) {
  const enabled = btcpayConfigured();
  const { thanks } = await searchParams;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back home
      </Link>

      <header className="mt-4 mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3">
          keep the lights on
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Support <span className="text-accent">Hashden</span>.
        </h1>
        <p className="mt-5 text-base text-ink-dim leading-relaxed">
          Hashden is a one-person, open-source project. The platform fee covers
          hosting at scale, but in the open alpha there aren&apos;t many blocks
          yet — so tips keep the stratum, the API, and the marketplace running.
          This is a voluntary tip to the project, completely separate from
          mining payouts. It never touches the non-custodial member flow.
        </p>
      </header>

      {enabled ? (
        <SupportForm initialThanks={thanks === "1"} />
      ) : (
        <div className="mt-6 rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-dim leading-relaxed">
          Donations aren&apos;t configured on this deployment yet. If you want to
          support the project, DM{" "}
          <a
            href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            @icaruswings
          </a>{" "}
          on Nostr.
        </div>
      )}

      <p className="mt-10 text-xs text-ink-mute leading-relaxed">
        Payments are processed by a self-hosted{" "}
        <a
          href="https://btcpayserver.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-dim transition-colors underline"
        >
          BTCPay Server
        </a>
        . Hashden renders the checkout; BTCPay mints the invoice and settles the
        funds.
      </p>
    </main>
  );
}
