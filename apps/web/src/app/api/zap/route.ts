import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { verifyEvent } from "nostr-tools/pure";
import {
  zapConfigured,
  zapRecipientHex,
  requestZapInvoice,
} from "@/lib/zap-server";
import type { ZapInvoice } from "@/lib/zap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1 sat … 0.1 BTC, in millisats. The recipient's LNURL range is also enforced.
const MIN_MSAT = 1_000;
const MAX_MSAT = 10_000_000_000;

// Best-effort per-IP rate limit (same rationale as /api/donate).
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

export async function POST(req: Request) {
  if (!zapConfigured()) {
    return NextResponse.json(
      { error: "Zaps are not configured on this deployment." },
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
  const raw = (body as { zapRequest?: unknown })?.zapRequest;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Missing zapRequest." }, { status: 400 });
  }
  // verifyEvent checks id + schnorr sig; cast to its expected event shape.
  const zapRequest = raw as Parameters<typeof verifyEvent>[0];

  // Must be a valid, signed kind-9734 addressed to the configured recipient.
  if (zapRequest.kind !== 9734) {
    return NextResponse.json({ error: "Not a zap request." }, { status: 400 });
  }
  let signedOk = false;
  try {
    signedOk = verifyEvent(zapRequest);
  } catch {
    signedOk = false;
  }
  if (!signedOk) {
    return NextResponse.json(
      { error: "Zap request signature is invalid." },
      { status: 400 },
    );
  }

  const tags = Array.isArray(zapRequest.tags) ? zapRequest.tags : [];
  const pTag = tags.find((t) => t[0] === "p")?.[1];
  if (pTag !== zapRecipientHex()) {
    return NextResponse.json(
      { error: "Zap request is addressed to the wrong recipient." },
      { status: 400 },
    );
  }

  const amountMsat = Number(tags.find((t) => t[0] === "amount")?.[1]);
  if (!Number.isInteger(amountMsat) || amountMsat < MIN_MSAT || amountMsat > MAX_MSAT) {
    return NextResponse.json(
      { error: "Zap amount is missing or out of range." },
      { status: 400 },
    );
  }

  try {
    const { bolt11 } = await requestZapInvoice(zapRequest, amountMsat);
    const qrDataUrl = await QRCode.toDataURL(`lightning:${bolt11}`, {
      margin: 1,
      width: 464,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0c", light: "#ffffff" },
    });
    const payload: ZapInvoice = { bolt11, qrDataUrl };
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    console.error("[zap] create failed:", err);
    return NextResponse.json(
      { error: "Could not create the zap invoice. Please try again." },
      { status: 502 },
    );
  }
}
