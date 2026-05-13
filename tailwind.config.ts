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
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
