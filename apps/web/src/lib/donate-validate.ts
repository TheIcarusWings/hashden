// Pure validation + shared types for the donation flow. No I/O, so it's
// importable from both the route handler and (later) tests without pulling
// in the BTCPay client or Next runtime.

export type DonationCurrency = "SATS" | "USD";

// Bounds keep a single invoice sane and make abuse less interesting. Min is
// low enough for a token tip; max caps a fat-fingered amount.
export const DONATION_BOUNDS: Record<
  DonationCurrency,
  { min: number; max: number }
> = {
  SATS: { min: 1_000, max: 100_000_000 }, // 1k sats … 1 BTC
  USD: { min: 1, max: 50_000 },
};

export const MAX_NAME_LEN = 64;
export const MAX_MESSAGE_LEN = 280;

export interface ValidDonation {
  amount: number;
  currency: DonationCurrency;
  donorName?: string;
  message?: string;
}

export type DonationValidation =
  | { ok: true; value: ValidDonation }
  | { ok: false; error: string };

function isCurrency(v: unknown): v is DonationCurrency {
  return v === "SATS" || v === "USD";
}

export function validateDonation(body: unknown): DonationValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isCurrency(b.currency)) {
    return { ok: false, error: "currency must be 'SATS' or 'USD'" };
  }
  const currency = b.currency;

  const amount =
    typeof b.amount === "number"
      ? b.amount
      : typeof b.amount === "string"
        ? Number(b.amount)
        : NaN;
  if (!Number.isFinite(amount)) {
    return { ok: false, error: "amount must be a number" };
  }
  // SATS are indivisible; fiat is capped to cents.
  const normalizedAmount =
    currency === "SATS" ? Math.round(amount) : Math.round(amount * 100) / 100;

  const { min, max } = DONATION_BOUNDS[currency];
  if (normalizedAmount < min || normalizedAmount > max) {
    return {
      ok: false,
      error: `amount for ${currency} must be between ${min} and ${max}`,
    };
  }

  const donorName = trimToOptional(b.donorName, MAX_NAME_LEN);
  if (donorName.error) return { ok: false, error: `donorName ${donorName.error}` };
  const message = trimToOptional(b.message, MAX_MESSAGE_LEN);
  if (message.error) return { ok: false, error: `message ${message.error}` };

  return {
    ok: true,
    value: {
      amount: normalizedAmount,
      currency,
      donorName: donorName.value,
      message: message.value,
    },
  };
}

function trimToOptional(
  v: unknown,
  maxLen: number,
): { value?: string; error?: string } {
  if (v === undefined || v === null || v === "") return {};
  if (typeof v !== "string") return { error: "must be a string" };
  const trimmed = v.trim();
  if (trimmed === "") return {};
  if (trimmed.length > maxLen) return { error: `must be ≤ ${maxLen} chars` };
  return { value: trimmed };
}

// ---- Response shape returned to the client by POST /api/donate ----

// What the single QR encodes: a unified BIP21 (on-chain + lightning, the
// donor's wallet picks), or a single rail when the store only offers one.
export type DonationQrMode = "unified" | "lightning" | "onchain";

export interface DonationCreated {
  invoiceId: string;
  checkoutLink: string;
  /** ISO timestamp the invoice expires. */
  expiresAt: string;
  /** Requested amount + currency, as echoed by BTCPay (e.g. "1000" "SATS"). */
  amount: string;
  currency: string;
  /** BTC-denominated amount due, when known. */
  amountBtc?: string;
  /** The single QR shown to the donor. */
  qr: {
    mode: DonationQrMode;
    /** The exact string the QR encodes. */
    paymentString: string;
    /** Pre-rendered QR as a PNG data URL (rendered into an <img>). */
    qrDataUrl: string;
  };
  /** BOLT11 for a "copy Lightning invoice" button, when a LN rail is offered. */
  lightning?: { invoice: string };
  /** Address + amount for a "copy on-chain address" button, when offered. */
  onchain?: { address: string; amountBtc: string };
}

// ---- Status returned by GET /api/donate/[id] ----

export type DonationStatus =
  | "new"
  | "processing"
  | "settled"
  | "expired"
  | "invalid";

export interface DonationStatusResult {
  status: DonationStatus;
  /** Payment detected (mempool/LN) but not necessarily fully confirmed. */
  paid: boolean;
  /** Terminal success. */
  settled: boolean;
}
