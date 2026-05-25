import type { Config } from "tailwindcss";

// Colors are driven by CSS custom properties (see globals.css) so the app can
// switch design directions at runtime via a `data-theme` attribute on <html>.
// Each variable holds space-separated RGB *channels* (e.g. "247 147 26") so
// Tailwind's `<alpha-value>` opacity modifiers (bg-accent/30, border-line/40…)
// keep working through the `rgb(var(--x) / <alpha-value>)` form.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--c-bg) / <alpha-value>)",
          subtle: "rgb(var(--c-bg-subtle) / <alpha-value>)",
          panel: "rgb(var(--c-bg-panel) / <alpha-value>)",
          elevated: "rgb(var(--c-bg-elevated) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          dim: "rgb(var(--c-ink-dim) / <alpha-value>)",
          mute: "rgb(var(--c-ink-mute) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          dim: "rgb(var(--c-accent-dim) / <alpha-value>)",
          glow: "rgb(var(--c-accent-glow) / <alpha-value>)",
          // Ember — deep warm tone for glows/celebration. Used by newer themes.
          deep: "rgb(var(--c-accent-deep) / <alpha-value>)",
        },
        // Liveness signal — used by /status and "is the service up" indicators.
        // Distinct from accent so a hot warning never reads as a healthy green.
        good: {
          DEFAULT: "rgb(var(--c-good) / <alpha-value>)",
          dim: "rgb(var(--c-good-dim) / <alpha-value>)",
          glow: "rgb(var(--c-good-glow) / <alpha-value>)",
        },
        line: "rgb(var(--c-line) / <alpha-value>)",
      },
      borderRadius: {
        none: "0px",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-lg)",
        full: "9999px",
      },
      fontFamily: {
        // Display/headings — characterful per theme (serif, grotesque, or mono).
        display: [
          "var(--font-display)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        // Body — readable per theme; falls back to the mono baseline.
        sans: [
          "var(--font-body)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // Data — hashes, addresses, sats, hashrate, code.
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
