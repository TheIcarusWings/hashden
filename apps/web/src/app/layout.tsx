import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Hashden",
  description:
    "A marketplace of Bitcoin solo-mining groups. Nostr for identity, on-chain for payouts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body>
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
                href={"/" as any}
                className="hover:text-ink transition-colors"
              >
                Browse
              </Link>
              <Link
                href={"/docs" as any}
                className="hover:text-ink transition-colors"
              >
                Docs
              </Link>
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
      </body>
    </html>
  );
}
