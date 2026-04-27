import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hashden — solo mining marketplace",
  description:
    "A marketplace of Bitcoin solo-mining groups with Nostr-native identity, discovery, and payouts.",
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
