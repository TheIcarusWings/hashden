import { NextResponse } from "next/server";
import { btcpayConfigured, getInvoice } from "@/lib/btcpay";
import type {
  DonationStatus,
  DonationStatusResult,
} from "@/lib/donate-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, DonationStatus> = {
  New: "new",
  Processing: "processing",
  Settled: "settled",
  Complete: "settled", // older BTCPay alias
  Confirmed: "settled", // older BTCPay alias
  Expired: "expired",
  Invalid: "invalid",
};

// Status polling for a single invoice. Proxied so the API key/store never
// reach the browser. Returns only the coarse status — no amounts, no metadata.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!btcpayConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  try {
    const invoice = await getInvoice(id);
    const status: DonationStatus = STATUS_MAP[invoice.status] ?? "new";
    const result: DonationStatusResult = {
      status,
      paid: status === "processing" || status === "settled",
      settled: status === "settled",
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[donate] status failed:", err);
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
