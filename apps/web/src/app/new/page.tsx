"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  buildGroupMetadataEvent,
  detectNip07,
  type GroupMetadataContent,
  type Nip07Signer,
} from "@hashden/nostr";
import { createGroup, testOperatorRpc } from "@/lib/api";
import { HASHDEN_STRATUM_URL } from "@/lib/env";

type Phase =
  | { kind: "DISCONNECTED" }
  | { kind: "DETECTING" }
  | { kind: "CONNECTED"; pubkey: string; signer: Nip07Signer }
  | { kind: "SUBMITTING" }
  | { kind: "ERROR"; message: string }
  | { kind: "DONE"; slug: string };

interface FormState {
  slug: string;
  name: string;
  description: string;
  feeBps: string; // string in form; parsed to int on submit
  payoutRule: "PPLNS" | "SOLO_SHOWCASE";
  templateSource: "PLATFORM_DEFAULT" | "OPERATOR_RPC";
  operatorBtcAddress: string;
  operatorRpcUrl: string;
  operatorRpcAuth: string;
}

const INITIAL_FORM: FormState = {
  slug: "",
  name: "",
  description: "",
  feeBps: "200",
  payoutRule: "PPLNS",
  templateSource: "PLATFORM_DEFAULT",
  operatorBtcAddress: "",
  operatorRpcUrl: "",
  operatorRpcAuth: "",
};

export default function NewGroupPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "DISCONNECTED" });
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [rpcTest, setRpcTest] = useState<
    | null
    | { kind: "TESTING" }
    | { kind: "OK"; height: number }
    | { kind: "FAIL"; reason: string }
  >(null);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function connect() {
    setPhase({ kind: "DETECTING" });
    const status = detectNip07();
    if (status.kind === "MISSING") {
      setPhase({
        kind: "ERROR",
        message:
          "No NIP-07 signer found. Install Alby (chrome.google.com/webstore/detail/alby) or nos2x.",
      });
      return;
    }
    try {
      const pubkey = await status.signer.getPublicKey();
      setPhase({ kind: "CONNECTED", pubkey, signer: status.signer });
    } catch (e) {
      setPhase({ kind: "ERROR", message: (e as Error).message });
    }
  }

  async function testRpc() {
    if (!form.operatorRpcUrl || !form.operatorRpcAuth) {
      setRpcTest({
        kind: "FAIL",
        reason: "Both URL and auth (user:pass) are required",
      });
      return;
    }
    setRpcTest({ kind: "TESTING" });
    const r = await testOperatorRpc({
      url: form.operatorRpcUrl,
      auth: form.operatorRpcAuth,
    });
    if (r.ok) setRpcTest({ kind: "OK", height: r.height });
    else setRpcTest({ kind: "FAIL", reason: r.reason });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase.kind !== "CONNECTED") return;

    const feeBps = Number.parseInt(form.feeBps, 10);
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
      setPhase({ kind: "ERROR", message: "fee must be integer 0..10000 bps" });
      return;
    }

    const content: GroupMetadataContent = {
      name: form.name,
      description: form.description,
      fee_bps: feeBps,
      payout_rule: form.payoutRule,
      template_source: form.templateSource,
      operator_btc_address: form.operatorBtcAddress,
      stratum_url: HASHDEN_STRATUM_URL,
    };

    setPhase({ kind: "SUBMITTING" });
    try {
      const unsigned = buildGroupMetadataEvent({
        operatorPubkey: phase.pubkey,
        slug: form.slug,
        content,
      });
      const signed = await phase.signer.signEvent(unsigned);
      const result = await createGroup({
        signedEvent: signed,
        operatorRpcUrl:
          form.templateSource === "OPERATOR_RPC"
            ? form.operatorRpcUrl
            : undefined,
        operatorRpcAuth:
          form.templateSource === "OPERATOR_RPC"
            ? form.operatorRpcAuth
            : undefined,
      });
      setPhase({ kind: "DONE", slug: result.slug });
      router.push(`/g/${result.slug}` as any);
    } catch (err) {
      setPhase({ kind: "ERROR", message: (err as Error).message });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-10">
        <Link
          href={"/" as any}
          className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
        >
          ← back to marketplace
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Create a den
        </h1>
        <p className="mt-2 text-sm text-ink-dim">
          Operators sign group metadata with their Nostr key. Members find
          your den, register their BTC + Lightning addresses, and point
          their hardware at your stratum URL.
        </p>
      </header>

      {phase.kind === "DISCONNECTED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6 mb-8">
          <div className="text-sm text-ink-dim mb-3">
            Connect your Nostr signer to begin.
          </div>
          <button
            onClick={connect}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Connect with NIP-07
          </button>
        </div>
      )}

      {phase.kind === "DETECTING" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6 mb-8 text-sm text-ink-dim">
          Looking for a signer extension…
        </div>
      )}

      {phase.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5 mb-8">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Error
          </div>
          <div className="text-sm text-ink">{phase.message}</div>
          <button
            onClick={() => setPhase({ kind: "DISCONNECTED" })}
            className="mt-3 text-xs text-ink-dim underline hover:text-ink"
          >
            Reset
          </button>
        </div>
      )}

      {(phase.kind === "CONNECTED" || phase.kind === "SUBMITTING") && (
        <>
          <div className="rounded-md border border-line bg-bg-panel p-3 mb-6 text-xs font-mono text-ink-dim">
            connected: {phase.kind === "CONNECTED" ? phase.pubkey : "..."}
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <Field
              label="Slug"
              hint="Lowercase letters, digits, dashes. Used in your stratum worker name."
            >
              <input
                value={form.slug}
                onChange={(e) =>
                  update("slug", e.target.value.toLowerCase().trim())
                }
                pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
                required
                placeholder="my-den"
                className={inputClass}
              />
            </Field>

            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                maxLength={64}
                className={inputClass}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                maxLength={2000}
                className={`${inputClass} resize-none`}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Fee (basis points)" hint="200 = 2%">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={form.feeBps}
                  onChange={(e) => update("feeBps", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Payout rule">
                <select
                  value={form.payoutRule}
                  onChange={(e) =>
                    update("payoutRule", e.target.value as FormState["payoutRule"])
                  }
                  className={inputClass}
                >
                  <option value="PPLNS">PPLNS</option>
                  <option value="SOLO_SHOWCASE">Solo showcase</option>
                </select>
              </Field>
            </div>

            <Field
              label="Operator BTC address"
              hint="Cold address that receives the operator-fee + dust-bucket coinbase outputs"
            >
              <input
                value={form.operatorBtcAddress}
                onChange={(e) => update("operatorBtcAddress", e.target.value.trim())}
                required
                placeholder="bc1q…"
                className={inputClass}
              />
            </Field>

            <Field label="Template source">
              <select
                value={form.templateSource}
                onChange={(e) =>
                  update(
                    "templateSource",
                    e.target.value as FormState["templateSource"],
                  )
                }
                className={inputClass}
              >
                <option value="PLATFORM_DEFAULT">
                  Platform default (Knots on hashden's node)
                </option>
                <option value="OPERATOR_RPC">
                  Operator RPC (your own node — Core / Knots / Libre Relay / DATUM)
                </option>
              </select>
            </Field>

            {form.templateSource === "OPERATOR_RPC" && (
              <div className="rounded-lg border border-line bg-bg-subtle p-5 space-y-4">
                <Field label="Operator RPC URL">
                  <input
                    value={form.operatorRpcUrl}
                    onChange={(e) => update("operatorRpcUrl", e.target.value.trim())}
                    placeholder="http://node.example:8332"
                    className={inputClass}
                  />
                </Field>
                <Field label="Operator RPC auth (user:pass)">
                  <input
                    type="password"
                    value={form.operatorRpcAuth}
                    onChange={(e) => update("operatorRpcAuth", e.target.value)}
                    placeholder="rpcuser:rpcpass"
                    className={inputClass}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={testRpc}
                    disabled={rpcTest?.kind === "TESTING"}
                    className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-ink-mute transition-colors disabled:opacity-50"
                  >
                    {rpcTest?.kind === "TESTING" ? "Testing…" : "Test connection"}
                  </button>
                  {rpcTest?.kind === "OK" && (
                    <span className="text-xs text-accent">
                      ✓ tip height {rpcTest.height}
                    </span>
                  )}
                  {rpcTest?.kind === "FAIL" && (
                    <span className="text-xs text-accent">
                      ✗ {rpcTest.reason}
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={phase.kind === "SUBMITTING"}
              className="w-full rounded-md bg-accent text-bg px-5 py-3 text-sm font-medium hover:bg-accent-glow transition-colors disabled:opacity-50"
            >
              {phase.kind === "SUBMITTING"
                ? "Signing + publishing…"
                : "Sign + publish + create"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-ink-mute mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-mute">{hint}</div>}
    </label>
  );
}
