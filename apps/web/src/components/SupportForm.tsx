"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createDonation, getDonationStatus } from "@/lib/donate";
import type {
  DonationCreated,
  DonationCurrency,
} from "@/lib/donate-validate";

// Suggested amounts, in sats. Bitcoin-native audience, so sats are primary.
const PRESETS_SATS = [1_000, 5_000, 21_000, 100_000];

type Phase =
  | { kind: "FORM" }
  | { kind: "CREATING" }
  | { kind: "CHECKOUT"; donation: DonationCreated }
  | { kind: "SETTLED" }
  | { kind: "EXPIRED"; checkoutLink?: string }
  | { kind: "ERROR"; message: string };

export function SupportForm({ initialThanks = false }: { initialThanks?: boolean }) {
  const [phase, setPhase] = useState<Phase>(
    initialThanks ? { kind: "SETTLED" } : { kind: "FORM" },
  );

  // ----- form state -----
  const [unit, setUnit] = useState<DonationCurrency>("SATS");
  const [amount, setAmount] = useState<string>("21000");
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");

  function selectPreset(sats: number) {
    setUnit("SATS");
    setAmount(String(sats));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPhase({ kind: "ERROR", message: "Enter a valid amount." });
      return;
    }
    setPhase({ kind: "CREATING" });
    try {
      const donation = await createDonation({
        amount: parsed,
        currency: unit,
        donorName: donorName.trim() || undefined,
        message: message.trim() || undefined,
      });
      setPhase({ kind: "CHECKOUT", donation });
    } catch (err) {
      setPhase({ kind: "ERROR", message: (err as Error).message });
    }
  }

  function reset() {
    setPhase({ kind: "FORM" });
  }

  return (
    <div className="mt-10">
      {phase.kind === "FORM" && (
        <form onSubmit={onSubmit} className="space-y-7">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-mute mb-3">
              Amount
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS_SATS.map((sats) => {
                const active = unit === "SATS" && Number(amount) === sats;
                return (
                  <button
                    key={sats}
                    type="button"
                    onClick={() => selectPreset(sats)}
                    className={`rounded-md border px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-bg-panel text-ink-dim hover:border-ink-mute"
                    }`}
                  >
                    {sats.toLocaleString()}
                    <span className="block text-[10px] uppercase tracking-wider text-ink-mute">
                      sats
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-ink-mute mb-1.5">
              Or a custom amount
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={unit === "SATS" ? 1 : 0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
              />
              <div className="flex shrink-0 rounded-md border border-line bg-bg-panel p-0.5">
                {(["SATS", "USD"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`rounded px-3 text-xs font-medium uppercase tracking-wider transition-colors ${
                      unit === u
                        ? "bg-accent text-bg"
                        : "text-ink-mute hover:text-ink-dim"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs text-ink-mute hover:text-ink-dim transition-colors list-none">
              + Add a name or message{" "}
              <span className="text-ink-mute">(optional, private)</span>
            </summary>
            <div className="mt-4 space-y-4">
              <label className="block">
                <div className="text-xs uppercase tracking-wider text-ink-mute mb-1.5">
                  Name
                </div>
                <input
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  maxLength={64}
                  placeholder="anon"
                  className="w-full rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
                />
              </label>
              <label className="block">
                <div className="text-xs uppercase tracking-wider text-ink-mute mb-1.5">
                  Message
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={280}
                  rows={2}
                  className="w-full resize-none rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
                />
              </label>
              <p className="text-xs text-ink-mute leading-relaxed">
                Only the project sees this, in its BTCPay dashboard. It is never
                shown publicly on Hashden.
              </p>
            </div>
          </details>

          <button
            type="submit"
            className="w-full rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Continue to payment →
          </button>
        </form>
      )}

      {phase.kind === "CREATING" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-8 text-center text-sm text-ink-dim">
          Creating your invoice…
        </div>
      )}

      {phase.kind === "CHECKOUT" && (
        <Checkout
          donation={phase.donation}
          onSettled={() => setPhase({ kind: "SETTLED" })}
          onExpired={() =>
            setPhase({
              kind: "EXPIRED",
              checkoutLink: phase.donation.checkoutLink,
            })
          }
          onCancel={reset}
        />
      )}

      {phase.kind === "SETTLED" && (
        <div className="rounded-lg border border-good/40 bg-good/10 p-8 text-center">
          <div className="text-3xl mb-3">⚡</div>
          <div className="text-lg font-semibold text-ink">Thank you.</div>
          <p className="mt-2 text-sm text-ink-dim leading-relaxed">
            Your support keeps the stratum, the API, and the lights on. Every
            sat goes straight to running Hashden.
          </p>
          <button
            onClick={reset}
            className="mt-5 text-xs text-ink-dim underline hover:text-ink transition-colors"
          >
            Send another
          </button>
        </div>
      )}

      {phase.kind === "EXPIRED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-8 text-center">
          <div className="text-lg font-semibold text-ink">Invoice expired</div>
          <p className="mt-2 text-sm text-ink-dim">
            No payment was detected before it timed out. No harm done — start a
            fresh one.
          </p>
          <button
            onClick={reset}
            className="mt-5 rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {phase.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-6">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Something went wrong
          </div>
          <div className="text-sm text-ink">{phase.message}</div>
          <button
            onClick={reset}
            className="mt-3 text-xs text-ink-dim underline hover:text-ink transition-colors"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function Checkout({
  donation,
  onSettled,
  onExpired,
  onCancel,
}: {
  donation: DonationCreated;
  onSettled: () => void;
  onExpired: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"lightning" | "onchain">(
    donation.methods[0]?.type ?? "lightning",
  );
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(donation.expiresAt).getTime() - Date.now(),
  );
  const [detected, setDetected] = useState(false);

  // Keep callbacks stable for the polling effect.
  const settledRef = useRef(onSettled);
  const expiredRef = useRef(onExpired);
  settledRef.current = onSettled;
  expiredRef.current = onExpired;

  // Countdown tick.
  useEffect(() => {
    const id = setInterval(() => {
      setRemainingMs(new Date(donation.expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [donation.expiresAt]);

  // Status polling.
  useEffect(() => {
    let stopped = false;
    const id = setInterval(async () => {
      try {
        const s = await getDonationStatus(donation.invoiceId);
        if (stopped) return;
        if (s.paid) setDetected(true);
        if (s.settled) {
          clearInterval(id);
          settledRef.current();
        } else if (s.status === "expired" || s.status === "invalid") {
          clearInterval(id);
          expiredRef.current();
        }
      } catch {
        // transient; keep polling
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [donation.invoiceId]);

  const active = donation.methods.find((m) => m.type === tab) ?? donation.methods[0];

  const copy = useCallback(async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.paymentString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  }, [active]);

  const expired = remainingMs <= 0;
  const mm = Math.max(0, Math.floor(remainingMs / 60000));
  const ss = Math.max(0, Math.floor((remainingMs % 60000) / 1000));

  if (!active) return null;

  return (
    <div className="space-y-6">
      {donation.methods.length > 1 && (
        <div className="flex rounded-md border border-line bg-bg-panel p-1">
          {donation.methods.map((m) => (
            <button
              key={m.type}
              onClick={() => setTab(m.type)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                tab === m.type
                  ? "bg-accent text-bg"
                  : "text-ink-mute hover:text-ink-dim"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center">
        <div className="rounded-lg bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no domain to optimize */}
          <img
            src={active.qrDataUrl}
            alt={`${active.label} payment QR code`}
            width={232}
            height={232}
          />
        </div>
        <div className="mt-3 text-xs text-ink-mute font-mono">
          {active.amountBtc} BTC · {active.label}
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <code className="flex-1 truncate rounded-md border border-line bg-bg-panel px-3 py-2 text-xs font-mono text-ink-dim">
          {active.paymentString}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-md border border-line px-3 text-xs hover:border-accent hover:text-accent transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="rounded-md border border-line bg-bg-subtle px-4 py-3 text-center text-xs">
        {detected ? (
          <span className="text-good">
            ⚡ Payment detected — waiting for confirmation…
          </span>
        ) : expired ? (
          <span className="text-ink-mute">Expired</span>
        ) : (
          <span className="text-ink-dim">
            Waiting for payment · expires in{" "}
            <span className="font-mono text-ink">
              {mm}:{ss.toString().padStart(2, "0")}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          onClick={onCancel}
          className="text-ink-mute underline hover:text-ink-dim transition-colors"
        >
          ← Change amount
        </button>
        <a
          href={donation.checkoutLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-mute hover:text-ink-dim transition-colors"
        >
          Trouble paying? Open in BTCPay ↗
        </a>
      </div>
    </div>
  );
}
