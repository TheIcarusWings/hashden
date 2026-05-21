// Server-only BTCPay Greenfield client for *project donations*.
//
// IMPORTANT: this is NOT the member payout flow. Donations are voluntary tips
// that settle into the project's own BTCPay store; member block rewards never
// touch this path (they go straight to coinbase outputs / operator dust
// fan-out). Keep the two completely separate.
//
// All three values are read from non-public env so the API key never reaches
// the browser. The /api/donate route handlers are the only callers.

const BTCPAY_URL = process.env.BTCPAY_URL?.replace(/\/+$/, "") || undefined;
const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID || undefined;
const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY || undefined;

/** True only when all three server-side BTCPay values are present. */
export function btcpayConfigured(): boolean {
  return Boolean(BTCPAY_URL && BTCPAY_STORE_ID && BTCPAY_API_KEY);
}

class BtcpayNotConfiguredError extends Error {
  constructor() {
    super("BTCPay is not configured (BTCPAY_URL / BTCPAY_STORE_ID / BTCPAY_API_KEY)");
    this.name = "BtcpayNotConfiguredError";
  }
}

async function gf<T>(path: string, init?: RequestInit): Promise<T> {
  if (!btcpayConfigured()) throw new BtcpayNotConfiguredError();
  const res = await fetch(
    `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}${path}`,
    {
      ...init,
      headers: {
        Authorization: `token ${BTCPAY_API_KEY}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BTCPay ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// Subset of the Greenfield invoice object we rely on. BTCPay returns more
// fields; we keep only what the donation flow needs.
export interface BtcpayInvoice {
  id: string;
  checkoutLink: string;
  status: BtcpayInvoiceStatus;
  amount: string;
  currency: string;
  /** Unix timestamp. Greenfield returns seconds; older builds returned ms. */
  expirationTime: number;
}

// Greenfield invoice states. We collapse them for the client in the route.
export type BtcpayInvoiceStatus =
  | "New"
  | "Processing"
  | "Settled"
  | "Expired"
  | "Invalid";

export interface BtcpayPaymentMethod {
  // Identifier varies across BTCPay versions ("BTC-CHAIN"/"BTC-LN" on newer,
  // "BTC"/"BTC_LightningLike" on older), so the route detects the rail from
  // paymentLink/destination rather than trusting this string.
  paymentMethodId: string;
  // On-chain address or BOLT11 invoice.
  destination: string;
  // BIP21 "bitcoin:…" or "lightning:…" URI. May be absent on some versions.
  paymentLink?: string | null;
  rate: string;
  // Amount denominated in BTC for this payment method.
  amount: string;
  due: string;
  activated?: boolean;
}

export async function createDonationInvoice(args: {
  amount: number;
  currency: string; // "SATS" | "USD"
  donorName?: string;
  message?: string;
  redirectUrl?: string;
}): Promise<BtcpayInvoice> {
  return gf<BtcpayInvoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      currency: args.currency,
      // Metadata lands in the BTCPay dashboard for the operator's own
      // bookkeeping. Donor name/message are optional and never surfaced
      // publicly by Hashden.
      metadata: {
        orderId: `hashden-donation-${Date.now()}`,
        itemDesc: "Hashden project donation",
        ...(args.donorName ? { buyerName: args.donorName } : {}),
        ...(args.message ? { donationMessage: args.message } : {}),
        source: "hashden-web",
      },
      checkout: {
        ...(args.redirectUrl ? { redirectURL: args.redirectUrl } : {}),
        redirectAutomatically: true,
      },
    }),
  });
}

export async function getInvoice(id: string): Promise<BtcpayInvoice> {
  return gf<BtcpayInvoice>(`/invoices/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function getInvoicePaymentMethods(
  id: string,
): Promise<BtcpayPaymentMethod[]> {
  return gf<BtcpayPaymentMethod[]>(
    `/invoices/${encodeURIComponent(id)}/payment-methods`,
    { method: "GET" },
  );
}
