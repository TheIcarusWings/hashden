"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  buildGroupDeletionEvent,
  buildGroupMetadataEvent,
  detectNip07,
  type GroupMetadataContent,
  type Nip07Signer,
} from "@hashden/nostr";
import {
  createGroup,
  deleteGroup,
  getGroup,
  testOperatorRpc,
  type PublicGroup,
} from "@/lib/api";
import { HASHDEN_STRATUM_URL } from "@/lib/env";
import { hexToNpub, shortNpub } from "@/lib/nostr/format";

type Phase =
  | { kind: "LOADING" }
  | { kind: "DISCONNECTED"; group: PublicGroup }
  | { kind: "DETECTING"; group: PublicGroup }
  | {
      kind: "CONNECTED";
      group: PublicGroup;
      pubkey: string;
      signer: Nip07Signer;
    }
  | {
      kind: "FORBIDDEN";
      group: PublicGroup;
      pubkey: string;
      reason: string;
    }
  | { kind: "SUBMITTING"; group: PublicGroup; pubkey: string }
  | { kind: "ERROR"; message: string }
  | { kind: "SAVED"; slug: string };

interface FormState {
  feeBps: string;
  payoutRule: "PPLNS" | "SOLO_SHOWCASE";
  templateSource: "PLATFORM_DEFAULT" | "OPERATOR_RPC";
  visibility: "PUBLIC" | "UNLISTED";
  operatorBtcAddress: string;
  operatorRpcUrl: string;
  operatorRpcAuth: string;
}

export default function GroupSettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [phase, setPhase] = useState<Phase>({ kind: "LOADING" });
  const [form, setForm] = useState<FormState | null>(null);
  const [rpcTest, setRpcTest] = useState<
    | null
    | { kind: "TESTING" }
    | { kind: "OK"; height: number }
    | { kind: "FAIL"; reason: string }
  >(null);
  // Delete flow lives outside the main phase machine so it doesn't have
  // to interleave with the form-save state.
  const [deletePhase, setDeletePhase] = useState<
    "idle" | "confirming" | "deleting" | { kind: "error"; message: string }
  >("idle");

  async function onDelete() {
    if (phase.kind !== "CONNECTED") return;
    setDeletePhase("deleting");
    try {
      const unsigned = buildGroupDeletionEvent({
        operatorPubkey: phase.pubkey,
        slug,
        reason: "den deleted by operator",
      });
      const signed = await phase.signer.signEvent(unsigned);
      await deleteGroup(slug, signed);
      router.push("/me" as any);
    } catch (err) {
      setDeletePhase({ kind: "error", message: (err as Error).message });
    }
  }

  // Load the group on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await getGroup(slug);
        if (cancelled) return;
        if (!g) {
          setPhase({ kind: "ERROR", message: `group ${slug} not found` });
          return;
        }
        setForm({
          feeBps: g.feeBps.toString(),
          payoutRule: g.payoutRule,
          templateSource: g.templateSource,
          // Deleted dens 410 out of getGroup, so reaching here means
          // visibility is PUBLIC or UNLISTED. Narrow for the form union.
          visibility:
            g.visibility === "DELETED"
              ? "UNLISTED"
              : (g.visibility as "PUBLIC" | "UNLISTED"),
          operatorBtcAddress: g.operatorBtcAddress,
          operatorRpcUrl: "",
          operatorRpcAuth: "",
        });
        setPhase({ kind: "DISCONNECTED", group: g });
      } catch (e) {
        setPhase({ kind: "ERROR", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function connect() {
    if (phase.kind !== "DISCONNECTED") return;
    const status = detectNip07();
    if (status.kind === "MISSING") {
      setPhase({
        kind: "ERROR",
        message:
          "No NIP-07 signer found. Install Alby or nos2x to manage your group.",
      });
      return;
    }
    setPhase({ ...phase, kind: "DETECTING" });
    try {
      const pubkey = await status.signer.getPublicKey();
      if (pubkey !== phase.group.operatorPubkey) {
        setPhase({
          kind: "FORBIDDEN",
          group: phase.group,
          pubkey,
          reason: "you are not the operator of this group",
        });
        return;
      }
      setPhase({
        kind: "CONNECTED",
        group: phase.group,
        pubkey,
        signer: status.signer,
      });
    } catch (e) {
      setPhase({ kind: "ERROR", message: (e as Error).message });
    }
  }

  async function testRpc() {
    if (!form) return;
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
    if (phase.kind !== "CONNECTED" || !form) return;

    const feeBps = Number.parseInt(form.feeBps, 10);
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
      setPhase({ kind: "ERROR", message: "fee must be integer 0..10000 bps" });
      return;
    }

    const content: GroupMetadataContent = {
      // Re-pull name/description from existing if not editable on this page.
      // (Keeping the form scoped to operationally-relevant fields for now.)
      name: phase.group.name,
      description: phase.group.description,
      fee_bps: feeBps,
      payout_rule: form.payoutRule,
      template_source: form.templateSource,
      operator_btc_address: form.operatorBtcAddress,
      stratum_url: HASHDEN_STRATUM_URL,
      visibility: form.visibility,
    };

    setPhase({ kind: "SUBMITTING", group: phase.group, pubkey: phase.pubkey });
    try {
      const unsigned = buildGroupMetadataEvent({
        operatorPubkey: phase.pubkey,
        slug,
        content,
      });
      const signed = await phase.signer.signEvent(unsigned);
      await createGroup({
        signedEvent: signed,
        operatorRpcUrl:
          form.templateSource === "OPERATOR_RPC"
            ? form.operatorRpcUrl
            : undefined,
        // Only send auth if user typed a new one; empty leaves existing.
        operatorRpcAuth:
          form.templateSource === "OPERATOR_RPC" && form.operatorRpcAuth
            ? form.operatorRpcAuth
            : undefined,
      });
      setPhase({ kind: "SAVED", slug });
      router.push(`/g/${slug}` as any);
    } catch (err) {
      setPhase({ kind: "ERROR", message: (err as Error).message });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={`/g/${slug}` as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to group
      </Link>
      <h1 className="mt-3 mb-10 text-3xl font-semibold tracking-tight">
        Settings: {slug}
      </h1>

      {phase.kind === "LOADING" && (
        <div className="text-sm text-ink-dim">loading…</div>
      )}

      {phase.kind === "ERROR" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Error
          </div>
          <div className="text-sm text-ink">{phase.message}</div>
        </div>
      )}

      {phase.kind === "DISCONNECTED" && (
        <div className="rounded-lg border border-line bg-bg-subtle p-6">
          <div className="text-sm text-ink-dim mb-3">
            Connect with the operator's Nostr key to edit settings.
          </div>
          <button
            onClick={connect}
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            Connect with NIP-07
          </button>
        </div>
      )}

      {phase.kind === "FORBIDDEN" && (
        <div className="rounded-lg border border-accent/30 bg-bg-subtle p-5">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            Not authorized
          </div>
          <div className="text-sm text-ink mb-2">{phase.reason}</div>
          <div className="text-xs font-mono text-ink-mute">
            connected: {shortNpub(phase.pubkey)}
            <br />
            operator:&nbsp;&nbsp;{shortNpub(phase.group.operatorPubkey)}
          </div>
        </div>
      )}

      {(phase.kind === "CONNECTED" || phase.kind === "SUBMITTING") && form && (
        <>
          <div className="rounded-md border border-line bg-bg-panel p-3 mb-6 text-xs font-mono text-ink-dim break-all">
            connected: {hexToNpub(phase.pubkey)} (operator)
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
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

            <fieldset className="rounded-lg border border-line bg-bg-subtle p-5">
              <legend className="px-2 text-xs uppercase tracking-wider text-ink-mute">
                Visibility
              </legend>
              <div className="space-y-3">
                <VisibilityChoice
                  name="visibility"
                  value="PUBLIC"
                  current={form.visibility}
                  onChange={(v) => update("visibility", v)}
                  label="Public"
                  hint="Listed in the public dens directory."
                />
                <VisibilityChoice
                  name="visibility"
                  value="UNLISTED"
                  current={form.visibility}
                  onChange={(v) => update("visibility", v)}
                  label="Unlisted"
                  hint="Hidden from the public dens directory. Only people with the link can find it. Members who already joined keep it in their dashboard."
                />
              </div>
            </fieldset>

            <Field label="Operator BTC address">
              <input
                value={form.operatorBtcAddress}
                onChange={(e) => update("operatorBtcAddress", e.target.value.trim())}
                required
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
                <option value="PLATFORM_DEFAULT">Platform default (Knots)</option>
                <option value="OPERATOR_RPC">Operator RPC</option>
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
                <Field
                  label="Operator RPC auth (user:pass)"
                  hint="Leave blank to keep the existing credential."
                >
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
                ? "Signing + saving…"
                : "Sign + save"}
            </button>
          </form>

          <section className="mt-12 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
            <div className="text-xs uppercase tracking-wider text-red-400 mb-2">
              Danger zone
            </div>
            <h2 className="text-base font-semibold text-ink mb-1">
              Delete this den
            </h2>
            <p className="text-sm text-ink-dim mb-4">
              Stops new members from joining and removes the den from the
              public directory and your dashboard. Past blocks and payouts stay
              recorded for audit, but the den can&apos;t be reactivated and
              the slug can&apos;t be reused.
            </p>

            {deletePhase === "idle" && (
              <button
                type="button"
                onClick={() => setDeletePhase("confirming")}
                className="rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Delete den
              </button>
            )}

            {deletePhase === "confirming" && (
              <div className="rounded-md border border-red-500/40 bg-bg-panel p-3 text-sm">
                <div className="text-ink mb-3">
                  This is irreversible. Sign a NIP-09 deletion event with
                  your Nostr signer to confirm?
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-md bg-red-500/80 px-4 py-2 text-sm text-white hover:bg-red-500 transition-colors"
                  >
                    Yes, delete den
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePhase("idle")}
                    className="rounded-md border border-line px-4 py-2 text-sm text-ink-dim hover:border-ink-mute transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deletePhase === "deleting" && (
              <div className="text-sm text-ink-dim">
                Signing + deleting…
              </div>
            )}

            {typeof deletePhase === "object" && deletePhase.kind === "error" && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
                Delete failed: {deletePhase.message}
                <button
                  type="button"
                  onClick={() => setDeletePhase("idle")}
                  className="ml-3 underline text-red-200"
                >
                  retry
                </button>
              </div>
            )}
          </section>
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

function VisibilityChoice({
  name,
  value,
  current,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: "PUBLIC" | "UNLISTED";
  current: "PUBLIC" | "UNLISTED";
  onChange: (v: "PUBLIC" | "UNLISTED") => void;
  label: string;
  hint: string;
}) {
  const selected = current === value;
  return (
    <label
      className={`block cursor-pointer rounded-md border p-3 transition-colors ${
        selected
          ? "border-accent bg-accent/5"
          : "border-line bg-bg-panel hover:border-ink-mute"
      }`}
    >
      <div className="flex items-baseline gap-3">
        <input
          type="radio"
          name={name}
          checked={selected}
          onChange={() => onChange(value)}
          className="accent-accent"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-ink">{label}</div>
          <div className="mt-1 text-xs text-ink-dim leading-relaxed">
            {hint}
          </div>
        </div>
      </div>
    </label>
  );
}
