// Client-safe fetch helpers for the donation flow. These hit Hashden's own
// /api/donate route handlers (NOT BTCPay directly) so the API key stays
// server-side. Mirrors the style of lib/api.ts.

import type {
  DonationCreated,
  DonationStatusResult,
  ValidDonation,
} from "./donate-validate";

export async function createDonation(
  input: ValidDonation,
): Promise<DonationCreated> {
  const res = await fetch("/api/donate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(msg || `Donation request failed (${res.status})`);
  }
  return (await res.json()) as DonationCreated;
}

export async function getDonationStatus(
  invoiceId: string,
): Promise<DonationStatusResult> {
  const res = await fetch(`/api/donate/${encodeURIComponent(invoiceId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`status check failed (${res.status})`);
  return (await res.json()) as DonationStatusResult;
}
