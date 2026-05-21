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

// Detect the payment rail from the URI/destination rather than BTCPay's
// version-dependent paymentMethodId.
function classify(
  pm: BtcpayPaymentMethod,
): { type: "lightning" | "onchain"; paymentString: string } | null {
  const link = pm.paymentLink?.trim();
  const dest = pm.destination?.trim();
  const probe = (link || dest || "").toLowerCase();
  if (
    probe.startsWith("lightning:") ||
    probe.startsWith("lnbc") ||
    probe.startsWith("lntb") ||
    probe.startsWith("lnbcrt")
  ) {
    return { type: "lightning", paymentString: link || dest };
  }
  if (probe.startsWith("bitcoin:") || probe.startsWith("bc1") || /^[123]/.test(probe)) {
    return { type: "onchain", paymentString: link || dest };
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

    const methods: DonationPaymentMethod[] = [];
    for (const pm of pms) {
      if (pm.activated === false) continue;
      const c = classify(pm);
      if (!c || !c.paymentString) continue;
      const qrDataUrl = await QRCode.toDataURL(c.paymentString, {
        margin: 1,
        width: 464, // rendered at 232px; 2x for crispness
        errorCorrectionLevel: "M",
        color: { dark: "#0a0a0c", light: "#ffffff" },
      });
      methods.push({
        type: c.type,
        label: c.type === "lightning" ? "Lightning" : "On-chain",
        paymentString: c.paymentString,
        qrDataUrl,
        amountBtc: pm.amount,
      });
    }

    if (methods.length === 0) {
      return NextResponse.json(
        { error: "No payment methods are available on the BTCPay store." },
        { status: 502 },
      );
    }

    // Lightning first — it's the better UX for small tips.
    methods.sort((a, b) => (a.type === "lightning" ? -1 : 1) - (b.type === "lightning" ? -1 : 1));

    const payload: DonationCreated = {
      invoiceId: invoice.id,
      checkoutLink: invoice.checkoutLink,
      expiresAt: new Date(invoice.expirationTime).toISOString(),
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
