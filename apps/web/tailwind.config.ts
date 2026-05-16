import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Hashden palette — dark Bitcoin-orange accent.
        bg: {
          DEFAULT: "#0a0a0c",
          subtle: "#15151a",
          panel: "#1c1c22",
        },
        ink: {
          DEFAULT: "#f5f5f7",
          dim: "#a3a3a8",
          mute: "#6f6f76",
        },
        accent: {
          DEFAULT: "#f7931a",
          dim: "#bf6f12",
          glow: "#fbbf68",
        },
        // Liveness signal — used by /status and similar "is the service
        // up" indicators. Distinct from `accent` (orange) so users don't
        // confuse a hot warning state with a healthy green one.
        good: {
          DEFAULT: "#34d399",
          dim: "#10b981",
          glow: "#6ee7b7",
        },
        line: "#26262d",
      },
      fontFamily: {
        sans: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
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
