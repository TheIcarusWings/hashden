"use client";

import { useCallback, useState } from "react";

// A shell command shown with a copy button. Used on /verify so the
// verification commands (which are long) are one click to run. Mirrors the
// clipboard pattern in SupportForm: copy to clipboard, flash "Copied", and
// degrade gracefully to manual selection if the clipboard API is blocked.
export function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; user can select the text manually */
    }
  }, [command]);

  return (
    <div className="relative rounded-md border border-line bg-bg-subtle">
      <pre className="overflow-x-auto p-4 pr-20 text-xs leading-relaxed text-ink-dim">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command to clipboard"
        className="absolute right-2 top-2 rounded-md border border-line bg-bg-panel px-2 py-1 text-xs text-ink-mute hover:border-accent hover:text-accent transition-colors"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
