import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f0c",
        panel: "#111815",
        panel2: "#161f1b",
        border: "#1f2a25",
        ink: "#e8f0ea",
        mute: "#8aa094",
        accent: "#34d399",
        accentDim: "#10b981",
        danger: "#f87171",
        gold: "#fbbf24",
      },
      fontFamily: {
        // Bricolage Grotesque -- wordmark + headlines
        display: [
          "var(--font-display)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // Geist -- body / UI default. globals.css applies font-sans on body
        // so the whole app picks it up. Variables come from `geist` npm pkg.
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        // Geist Mono -- tabular numerics across charts, scorecards, chips
        mono: [
          "var(--font-geist-mono)",
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
