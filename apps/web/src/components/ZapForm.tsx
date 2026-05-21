"use client";

import { useEffect, useMemo, useState } from "react";
import { SimplePool } from "nostr-tools/pool";
import { useNostrAuth } from "@/lib/nostr/useNostrAuth";
import { buildZapRequest, createZap, npubToHex } from "@/lib/zap";
import { hexToNpub } from "@/lib/nostr/format";
import { HASHDEN_RELAYS } from "@/lib/env";

const PRESETS_SATS = [1_000, 5_000, 21_000, 100_000];

type Phase =
  | { kind: "AMOUNT" }
  | { kind: "REQUESTING" }
  | { kind: "INVOICE"; bolt11: string; qrDataUrl: string }
  | { kind: "PAID" }
  | { kind: "ERROR"; message: string };

// Minimal WebLN typing — present when the extension (e.g. Alby) injects it.
interface WebLN {
  enable(): Promise<void>;
  sendPayment(invoice: string): Promise<{ preimage: string }>;
}

export function ZapForm({ zapNpub }: { zapNpub: string }) {
  const { state, connect } = useNostrAuth();
  const [amount, setAmount] = useState("21000");
  const [phase, setPhase] = useState<Phase>({ kind: "AMOUNT" });
  const [copied, setCopied] = useState(false);

  const recipientHex = useMemo(() => {
    try {
      return npubToHex(zapNpub);
    } catch {
      return "";
    }
  }, [zapNpub]);

  async function zap() {
    if (state.kind !== "CONNECTED" || !recipientHex) return;
    const sats = Number(amount);
    if (!Number.isFinite(sats) || sats <= 0) {
      setPhase({ kind: "ERROR", message: "Enter a valid amount." });
      return;
    }
    setPhase({ kind: "REQUESTING" });
    try {
      const req = buildZapRequest({
        recipientHex,
        amountMsat: Math.round(sats) * 1000,
        relays: HASHDEN_RELAYS,
      });
      const signed = await state.signer.signEvent(req);
      const inv = await createZap(signed);
      setPhase({ kind: "INVOICE", bolt11: inv.bolt11, qrDataUrl: inv.qrDataUrl });
    } catch (e) {
      setPhase({ kind: "ERROR", message: (e as Error).message });
    }
  }

  // Once we have an invoice: try one-click WebLN pay, and watch the relays for
  // the kind-9735 zap receipt as confirmation (covers wallets without WebLN).
  useEffect(() => {
    if (phase.kind !== "INVOICE") return;
    let done = false;
    const settle = () => {
      if (!done) {
        done = true;
        setPhase({ kind: "PAID" });
      }
    };

    const webln = (globalThis as { webln?: WebLN }).webln;
    if (webln) {
      (async () => {
        try {
          await webln.enable();
          await webln.sendPayment(phase.bolt11);
          settle();
        } catch {
          /* user dismissed or no funds — fall back to QR + receipt watch */
        }
      })();
    }

    const pool = new SimplePool();
    const sub = pool.subscribeMany(
      HASHDEN_RELAYS,
      {
        kinds: [9735],
        "#p": [recipientHex],
        since: Math.floor(Date.now() / 1000) - 60,
      },
      {
        onevent(ev) {
          const b = ev.tags.find((t) => t[0] === "bolt11")?.[1];
          if (b && b.toLowerCase() === phase.bolt11.toLowerCase()) settle();
        },
      },
    );

    return () => {
      done = true;
      try {
        sub.close();
      } catch {
        /* noop */
      }
      try {
        pool.close(HASHDEN_RELAYS);
      } catch {
        /* noop */
      }
    };
  }, [phase, recipientHex]);

  async function copyInvoice(bolt11: string) {
    try {
      await navigator.clipboard.writeText(bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  // ---- render ----

  if (phase.kind === "PAID") {
    return (
      <div className="rounded-lg border border-good/40 bg-good/10 p-8 text-center">
        <div className="text-3xl mb-3">⚡</div>
        <div className="text-lg font-semibold text-ink">Zapped!</div>
        <p className="mt-2 text-sm text-ink-dim leading-relaxed">
          Thank you — your zap is on its way to @icaruswings and keeps Hashden
          running.
        </p>
        <button
          onClick={() => setPhase({ kind: "AMOUNT" })}
          className="mt-5 text-xs text-ink-dim underline hover:text-ink transition-colors"
        >
          Send another
        </button>
      </div>
    );
  }

  if (phase.kind === "INVOICE") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center">
          <div className="rounded-lg bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
            <img
              src={phase.qrDataUrl}
              alt="Lightning zap QR code"
              width={232}
              height={232}
            />
          </div>
          <div className="mt-3 text-sm text-ink">
            {Number(amount).toLocaleString()} sats
          </div>
          <div className="mt-1 text-xs text-ink-mute">
            Scan with a Lightning wallet — or approve it in your extension
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <code className="flex-1 truncate rounded-md border border-line bg-bg-panel px-3 py-2 text-xs font-mono text-ink-dim">
            {phase.bolt11}
          </code>
          <button
            onClick={() => copyInvoice(phase.bolt11)}
            className="shrink-0 rounded-md border border-line px-3 text-xs hover:border-accent hover:text-accent transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="rounded-md border border-line bg-bg-subtle px-4 py-3 text-center text-xs text-ink-dim">
          Waiting for payment…
        </div>

        <button
          onClick={() => setPhase({ kind: "AMOUNT" })}
          className="text-xs text-ink-mute underline hover:text-ink-dim transition-colors"
        >
          ← Change amount
        </button>
      </div>
    );
  }

  // AMOUNT / REQUESTING / ERROR — all show the amount form (+ connect gate).
  return (
    <div className="space-y-7">
      {phase.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Something went wrong
          </div>
          <div className="text-sm text-ink">{phase.message}</div>
        </div>
      )}

      {state.kind !== "CONNECTED" ? (
        <div className="rounded-lg border border-line bg-bg-subtle p-6">
          <div className="text-sm text-ink-dim mb-3">
            Connect your Nostr signer to zap @icaruswings.
          </div>
          <button
            onClick={connect}
            disabled={state.kind === "CONNECTING"}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors disabled:opacity-50"
          >
            {state.kind === "CONNECTING" ? "Connecting…" : "Connect with NIP-07"}
          </button>
          {state.kind === "ERROR" && (
            <div className="mt-3 text-xs text-accent">{state.message}</div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-md border border-line bg-bg-panel p-3 text-xs font-mono text-ink-dim break-all">
            connected: {hexToNpub(state.pubkey)}
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-ink-mute mb-3">
              Amount
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS_SATS.map((sats) => {
                const active = Number(amount) === sats;
                return (
                  <button
                    key={sats}
                    type="button"
                    onClick={() => setAmount(String(sats))}
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
              Or a custom amount (sats)
            </div>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
            />
          </div>

          <button
            onClick={zap}
            disabled={phase.kind === "REQUESTING"}
            className="w-full rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors disabled:opacity-50"
          >
            {phase.kind === "REQUESTING" ? "Building zap…" : "Zap ⚡"}
          </button>
        </>
      )}
    </div>
  );
}
