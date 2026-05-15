import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
