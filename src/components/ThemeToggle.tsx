"use client";

import { useEffect, useState } from "react";

// Day (blush) / Dusk (plum) toggle. Persists to localStorage and flips the
// documentElement data-theme; the inline script in layout applies it before
// paint on subsequent loads.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function set(next: boolean) {
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "";
    try {
      localStorage.setItem("bloom-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div className="flex rounded-full border border-border bg-panel p-1 text-sm font-semibold">
      <button
        onClick={() => set(false)}
        className={`flex-1 rounded-full py-2 ${!dark ? "bg-accent text-ink-on-accent" : "text-mute"}`}
      >
        ☀️ Day
      </button>
      <button
        onClick={() => set(true)}
        className={`flex-1 rounded-full py-2 ${dark ? "bg-accent text-ink-on-accent" : "text-mute"}`}
      >
        🌙 Dusk
      </button>
    </div>
  );
}
