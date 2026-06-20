import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CSS variables (defined per-theme in globals.css) keep dark/light
        // palettes in lockstep. Tailwind's <alpha-value> substitution still
        // works because the values are RGB triples.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        panel2: "rgb(var(--color-panel2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        borderSoft: "rgb(var(--color-borderSoft) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        mute: "rgb(var(--color-mute) / <alpha-value>)",
        faint: "rgb(var(--color-faint) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        accentDim: "rgb(var(--color-accentDim) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
      },
      fontFamily: {
        // Theme-aware font roles. Each theme (Fairway / Caddie's Notebook /
        // Blueprint / Back Nine) re-points --font-display / --font-sans /
        // --font-mono in globals.css to a different next/font variable.
        // Display = wordmark + headlines, sans = body / UI, mono = scores
        // and tabular numerics (charts, scorecards, chips).
        display: [
          "var(--font-display)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
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
