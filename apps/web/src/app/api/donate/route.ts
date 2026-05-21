import { NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  btcpayConfigured,
  createDonationInvoice,
  getInvoicePaymentMethods,
  type BtcpayPaymentMethod,
} from "@/lib/btcpay";
import {
  validateDonation,
  type DonationCreated,
  type DonationPaymentMethod,
} from "@/lib/donate-validate";
import { APP_URL } from "@/lib/env";

// qrcode needs Node APIs and the invoice must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort in-memory rate limit. The web app runs as a long-lived Node
// standalone server (not per-request serverless), so this map persists across
// requests within the instance. It's a guard against casual invoice spam, not
// a hard security boundary — BTCPay itself is the source of truth.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Classify a payment method into a rail plus a preference score. A store can
// return several methods on one rail (e.g. BTC-LN BOLT11 *and* BTC-LNURL); we
// keep the highest-scored per rail so the UI shows one clean option each.
// Prefer the paymentMethodId, fall back to the URI prefix for unknown ids.
function classify(
  pm: BtcpayPaymentMethod,
): { rail: "lightning" | "onchain"; score: number; paymentString: string } | null {
  const paymentString = (pm.paymentLink || pm.destination || "").trim();
  if (!paymentString) return null;
  const id = (pm.paymentMethodId || "").toUpperCase();

  if (id.includes("CHAIN") || id === "BTC") {
    return { rail: "onchain", score: 1, paymentString };
  }
  if (id.includes("LNURL")) return { rail: "lightning", score: 1, paymentString };
  if (id.includes("LN")) return { rail: "lightning", score: 2, paymentString }; // BOLT11 preferred

  const probe = paymentString.toLowerCase();
  if (
    probe.startsWith("lightning:") ||
    probe.startsWith("lnbc") ||
    probe.startsWith("lntb") ||
    probe.startsWith("lnbcrt")
  ) {
    return { rail: "lightning", score: 1, paymentString };
  }
  if (probe.startsWith("bitcoin:") || probe.startsWith("bc1") || /^[13]/.test(probe)) {
    return { rail: "onchain", score: 1, paymentString };
  }
  return null;
}

export async function POST(req: Request) {
  if (!btcpayConfigured()) {
    return NextResponse.json(
      { error: "Donations are not configured on this deployment." },
      { status: 503 },
    );
  }

  if (rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const v = validateDonation(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const invoice = await createDonationInvoice({
      amount: v.value.amount,
      currency: v.value.currency,
      donorName: v.value.donorName,
      message: v.value.message,
      redirectUrl: `${APP_URL}/support?thanks=1`,
    });

    const pms = await getInvoicePaymentMethods(invoice.id);

    // Keep the best-scored payment method per rail (BOLT11 over LNURL, etc.).
    const best = new Map<
      "lightning" | "onchain",
      { score: number; paymentString: string; amountBtc: string }
    >();
    for (const pm of pms) {
      if (pm.activated === false) continue;
      const c = classify(pm);
      if (!c) continue;
      const cur = best.get(c.rail);
      if (!cur || c.score > cur.score) {
        best.set(c.rail, {
          score: c.score,
          paymentString: c.paymentString,
          amountBtc: pm.amount,
        });
      }
    }

    // Lightning first — better UX for small tips. On-chain only if the store
    // actually offers it (this store may be Lightning-only).
    const methods: DonationPaymentMethod[] = [];
    for (const rail of ["lightning", "onchain"] as const) {
      const b = best.get(rail);
      if (!b) continue;
      const qrDataUrl = await QRCode.toDataURL(b.paymentString, {
        margin: 1,
        width: 464, // rendered at 232px; 2x for crispness
        errorCorrectionLevel: "M",
        color: { dark: "#0a0a0c", light: "#ffffff" },
      });
      methods.push({
        type: rail,
        label: rail === "lightning" ? "Lightning" : "On-chain",
        paymentString: b.paymentString,
        qrDataUrl,
        amountBtc: b.amountBtc,
      });
    }

    if (methods.length === 0) {
      return NextResponse.json(
        { error: "No payment methods are available on the BTCPay store." },
        { status: 502 },
      );
    }

    // BTCPay Greenfield returns expirationTime in seconds; older builds used
    // ms. Normalize so the client countdown isn't off by 1000×.
    const expMs =
      invoice.expirationTime < 1e12
        ? invoice.expirationTime * 1000
        : invoice.expirationTime;

    const payload: DonationCreated = {
      invoiceId: invoice.id,
      checkoutLink: invoice.checkoutLink,
      expiresAt: new Date(expMs).toISOString(),
      amount: invoice.amount,
      currency: invoice.currency,
      methods,
    };
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    // Don't leak BTCPay internals to the client.
    console.error("[donate] create failed:", err);
    return NextResponse.json(
      { error: "Could not create the donation invoice. Please try again." },
      { status: 502 },
    );
  }
}
