"use client";

import { useState } from "react";
import { SupportForm } from "./SupportForm";
import { ZapForm } from "./ZapForm";

type Mode = "choose" | "zap" | "pay";

export function SupportOptions({
  payEnabled,
  zapEnabled,
  zapNpub,
  initialThanks = false,
}: {
  payEnabled: boolean;
  zapEnabled: boolean;
  zapNpub: string;
  initialThanks?: boolean;
}) {
  // A BTCPay redirect-back (?thanks=1) only applies to the Pay flow.
  const initialMode: Mode =
    initialThanks && payEnabled
      ? "pay"
      : zapEnabled && payEnabled
        ? "choose"
        : zapEnabled
          ? "zap"
          : "pay";
  const [mode, setMode] = useState<Mode>(initialMode);

  const bothEnabled = payEnabled && zapEnabled;

  if (mode === "zap") {
    return (
      <div className="mt-10">
        {bothEnabled && <BackLink onBack={() => setMode("choose")} />}
        <ZapForm zapNpub={zapNpub} />
      </div>
    );
  }

  if (mode === "pay") {
    return (
      <div className="mt-10">
        {bothEnabled && <BackLink onBack={() => setMode("choose")} />}
        <SupportForm initialThanks={initialThanks} />
      </div>
    );
  }

  // choose — two equal options side by side
  return (
    <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <OptionCard
        title="Zap ⚡"
        tag="Nostr-native"
        body="Zap @icaruswings straight from your Nostr extension. Public, on Lightning."
        onClick={() => setMode("zap")}
      />
      <OptionCard
        title="Pay"
        tag="Lightning or on-chain"
        body="Scan one unified QR with any Bitcoin wallet. No Nostr needed."
        onClick={() => setMode("pay")}
      />
    </div>
  );
}

function OptionCard({
  title,
  tag,
  body,
  onClick,
}: {
  title: string;
  tag: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-line bg-bg-subtle p-6 text-left hover:border-accent hover:bg-bg-elevated transition-colors"
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mb-3">
        {tag}
      </div>
      <div className="text-xl font-semibold text-ink mb-2">{title}</div>
      <div className="text-sm text-ink-dim leading-relaxed">{body}</div>
      <div className="mt-5 text-xs text-accent group-hover:underline">
        Continue →
      </div>
    </button>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-5 text-xs text-ink-mute underline hover:text-ink-dim transition-colors"
    >
      ← choose another way
    </button>
  );
}
