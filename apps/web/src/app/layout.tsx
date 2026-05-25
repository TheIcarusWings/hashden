import type { Metadata } from "next";
import { JetBrains_Mono, Fraunces, Hanken_Grotesk } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { Logo } from "@/components/Logo";
import { DenHearth } from "@/components/DenHearth";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { DONATIONS_ENABLED } from "@/lib/env";
import "./globals.css";

// Candidate fonts for the theme harness. `next/font` self-hosts these at build
// time (no runtime request to Google), which keeps the anonymity mandate intact.
// Each exposes a CSS variable; globals.css maps --font-display/-body/-mono onto
// them per theme.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
});

export const metadata: Metadata = {
  title: "Hashden",
  description:
    "A directory of Bitcoin solo-mining dens. Nostr for identity, on-chain for payouts, anonymous by default — no IPs, no fingerprints, no platform balance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="warm-lair"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${fraunces.variable} ${hanken.variable}`}
    >
      {/* Applies the saved theme before paint (no FOUC). Dev-only, like the switcher. */}
      {process.env.NODE_ENV !== "production" && (
        <Script id="theme-bootstrap" strategy="beforeInteractive" src="/theme-bootstrap.js" />
      )}
      <body>
        {/* Part of the shipped Warm Lair default; CSS-scoped to that theme. */}
        <DenHearth />
        <div className="bg-accent text-bg">
          <div className="mx-auto max-w-5xl px-6 py-2 text-xs flex items-center justify-center gap-2 flex-wrap text-center">
            <span className="font-semibold uppercase tracking-wider">
              Open alpha
            </span>
            <span className="opacity-70">·</span>
            <span>Expect rough edges. Found a bug?</span>
            <a
              href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              DM @icaruswings ↗
            </a>
          </div>
        </div>
        <header className="border-b border-line bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
            <Link
              href={"/" as any}
              className="flex items-center gap-2 font-semibold tracking-tight text-ink hover:text-accent transition-colors"
            >
              <Logo size={20} className="text-ink" />
              <span>Hashden</span>
            </Link>
            <div className="flex items-center gap-5 text-ink-dim">
              <Link
                href={"/dens" as any}
                className="hover:text-ink transition-colors"
              >
                Browse dens
              </Link>
              <Link
                href={"/docs" as any}
                className="hover:text-ink transition-colors"
              >
                Docs
              </Link>
              <Link
                href={"/verify" as any}
                className="hover:text-ink transition-colors"
              >
                Verify
              </Link>
              {DONATIONS_ENABLED && (
                <Link
                  href={"/support" as any}
                  className="text-accent hover:text-accent-glow transition-colors"
                >
                  Support ⚡
                </Link>
              )}
              <Link
                href={"/me" as any}
                className="rounded-md border border-line bg-bg-panel px-3 py-1.5 text-xs uppercase tracking-wider hover:border-accent hover:text-accent transition-colors"
              >
                My account
              </Link>
            </div>
          </nav>
        </header>
        {children}
        {process.env.NODE_ENV !== "production" && <ThemeSwitcher />}
      </body>
    </html>
  );
}
