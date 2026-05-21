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
  type DonationQrMode,
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
// return several methods on one rail (e.g. BTC-LN BOLT11 *and* BTC-LNURL); the
// higher score wins (BOLT11 over LNURL) so we feed the unified QR a real
// invoice. Prefer the paymentMethodId, fall back to the URI prefix.
function classify(
  pm: BtcpayPaymentMethod,
): { rail: "lightning" | "onchain"; score: number } | null {
  const id = (pm.paymentMethodId || "").toUpperCase();
  if (id.includes("CHAIN") || id === "BTC") return { rail: "onchain", score: 1 };
  if (id.includes("LNURL")) return { rail: "lightning", score: 1 };
  if (id.includes("LN")) return { rail: "lightning", score: 2 }; // BOLT11 preferred

  const probe = (pm.paymentLink || pm.destination || "").toLowerCase();
  if (
    probe.startsWith("lightning:") ||
    probe.startsWith("lnbc") ||
    probe.startsWith("lntb") ||
    probe.startsWith("lnbcrt")
  ) {
    return { rail: "lightning", score: 1 };
  }
  if (probe.startsWith("bitcoin:") || probe.startsWith("bc1") || /^[13]/.test(probe)) {
    return { rail: "onchain", score: 1 };
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

    // Collect the on-chain address and the best Lightning option (BOLT11 over
    // LNURL) so we can assemble a single unified QR.
    let onchain: { address: string; amountBtc: string; link: string } | undefined;
    let lightning:
      | { link: string; bolt11?: string; amountBtc: string; score: number }
      | undefined;

    for (const pm of pms) {
      if (pm.activated === false) continue;
      const c = classify(pm);
      if (!c) continue;
      const dest = pm.destination?.trim() || "";
      if (c.rail === "onchain") {
        if (!onchain && dest) {
          onchain = {
            address: dest,
            amountBtc: pm.amount,
            link: (pm.paymentLink || `bitcoin:${dest}?amount=${pm.amount}`).trim(),
          };
        }
      } else if (!lightning || c.score > lightning.score) {
        const link = (pm.paymentLink || (dest ? `lightning:${dest}` : "")).trim();
        if (link) {
          lightning = {
            link,
            // Only BTC-LN (score 2) gives a raw BOLT11 we can embed in BIP21.
            bolt11: c.score >= 2 ? dest || undefined : undefined,
            amountBtc: pm.amount,
            score: c.score,
          };
        }
      }
    }

    // Build the single QR. When both rails are live, emit a unified BIP21 URI
    // (`bitcoin:<addr>?amount=<btc>&lightning=<bolt11>`) so the donor's wallet
    // chooses; otherwise fall back to whichever rail the store offered.
    let mode: DonationQrMode;
    let paymentString: string;
    if (onchain && lightning?.bolt11) {
      const sep = onchain.link.includes("?") ? "&" : "?";
      paymentString = `${onchain.link}${sep}lightning=${lightning.bolt11}`;
      mode = "unified";
    } else if (lightning) {
      paymentString = lightning.link;
      mode = "lightning";
    } else if (onchain) {
      paymentString = onchain.link;
      mode = "onchain";
    } else {
      return NextResponse.json(
        { error: "No payment methods are available on the BTCPay store." },
        { status: 502 },
      );
    }

    // Unified strings are long, so use a lower error-correction level to keep
    // the module count (and on-screen density) scannable.
    const qrDataUrl = await QRCode.toDataURL(paymentString, {
      margin: 1,
      width: mode === "unified" ? 512 : 464, // rendered ~232px; scaled up for crispness
      errorCorrectionLevel: mode === "unified" ? "L" : "M",
      color: { dark: "#0a0a0c", light: "#ffffff" },
    });

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
      amountBtc: onchain?.amountBtc ?? lightning?.amountBtc,
      qr: { mode, paymentString, qrDataUrl },
      lightning: lightning
        ? { invoice: lightning.bolt11 ?? lightning.link.replace(/^lightning:/i, "") }
        : undefined,
      onchain: onchain
        ? { address: onchain.address, amountBtc: onchain.amountBtc }
        : undefined,
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
