"use client";

import { useEffect, useState } from "react";

/*
  Temporary design-harness widget. Flips the app between candidate design
  directions live and remembers the choice (localStorage; applied pre-paint by
  public/theme-bootstrap.js). Mounted behind a NODE_ENV check in layout.tsx so
  it never ships to production. Delete this file + the bootstrap + the extra
  [data-theme] blocks in globals.css to remove the experiment.

  Intentionally styled with fixed colors and arbitrary radii (NOT theme tokens)
  so the control stays legible and stable no matter which theme is active.
*/

type ThemeId =
  | "current"
  | "warm-lair"
  | "forest-lair"
  | "field-guide"
  | "terminal";

const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: "current", name: "Current", blurb: "today's baseline" },
  { id: "warm-lair", name: "Warm Lair", blurb: "warm dark · ember · serif" },
  { id: "forest-lair", name: "Forest Lair", blurb: "green brand · forest glow" },
  { id: "field-guide", name: "Field Guide", blurb: "cream almanac · editorial" },
  { id: "terminal", name: "Terminal", blurb: "mono instrument · sharp" },
];

const STORAGE_KEY = "hashden-theme";

export function ThemeSwitcher() {
  const [active, setActive] = useState<ThemeId>("warm-lair");
  const [open, setOpen] = useState(true);

  // Read whatever the bootstrap script already applied to <html>.
  useEffect(() => {
    const fromDom = document.documentElement.getAttribute(
      "data-theme",
    ) as ThemeId | null;
    if (fromDom) setActive(fromDom);
  }, []);

  function choose(id: ThemeId) {
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode — fine, just won't persist */
    }
    setActive(id);
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] text-zinc-100"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      {open ? (
        <div className="w-60 rounded-[14px] border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              Design preview
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-1 text-zinc-500 hover:text-zinc-200"
              aria-label="Collapse theme switcher"
            >
              ×
            </button>
          </div>

          <div className="space-y-1">
            {THEMES.map((t) => {
              const isActive = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => choose(t.id)}
                  aria-pressed={isActive}
                  className={`block w-full rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? "bg-orange-500/15 ring-1 ring-orange-500/50"
                      : "hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isActive ? "bg-orange-400" : "bg-zinc-600"
                      }`}
                    />
                    <span className="text-xs font-medium text-zinc-100">
                      {t.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block pl-4 text-[10px] text-zinc-400">
                    {t.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[9px] leading-snug text-zinc-500">
            Temporary harness · dev only
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-2xl backdrop-blur hover:border-zinc-500"
          aria-label="Open theme switcher"
        >
          ◐ {THEMES.find((t) => t.id === active)?.name}
        </button>
      )}
    </div>
  );
}
