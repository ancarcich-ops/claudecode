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
        // Fraunces -- soft display serif for the wordmark + headlines.
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        // Nunito -- rounded, friendly body/UI default. globals.css applies
        // it to <body> so the whole app inherits it.
        sans: [
          "var(--font-body)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
