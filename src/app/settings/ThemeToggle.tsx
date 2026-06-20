"use client";

import { useEffect, useState } from "react";

// Four switchable visual themes. Fairway is the original Sticks skin and
// the default (no data-theme attribute on <html>); the other three are
// applied via `data-theme="<id>"`. globals.css drives every token --
// palette + font roles -- off that attribute.
type ThemeId = "fairway" | "caddie" | "blueprint" | "backnine";

const STORAGE_KEY = "sticks-theme";

const THEMES: {
  id: ThemeId;
  label: string;
  sub: string;
  // Three swatch colors painted as a tiny preview in the picker:
  // panel background, accent, and ink text. They mirror the actual
  // CSS variables so the chip always matches the live skin.
  swatch: { bg: string; accent: string; ink: string };
}[] = [
  {
    id: "fairway",
    label: "Fairway",
    sub: "Default · dark",
    swatch: { bg: "#111815", accent: "#34D399", ink: "#E8EFE9" },
  },
  {
    id: "caddie",
    label: "Caddie's Notebook",
    sub: "Light · paper",
    swatch: { bg: "#F5EFE0", accent: "#B4382B", ink: "#211D16" },
  },
  {
    id: "blueprint",
    label: "Blueprint",
    sub: "Dark · cyanotype",
    swatch: { bg: "#0C2C4C", accent: "#3BC9F0", ink: "#EAF2FB" },
  },
  {
    id: "backnine",
    label: "Back Nine",
    sub: "Dark · turf",
    swatch: { bg: "#123022", accent: "#45D87A", ink: "#EAF3E8" },
  },
];

function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  if (theme === "fairway") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

// In-page theme switcher. Persists the chosen theme id to localStorage
// (key `sticks-theme`); the pre-paint script in layout.tsx reads the
// same key so reloads land on the right palette without a flash.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>("fairway");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (
        stored === "caddie" ||
        stored === "blueprint" ||
        stored === "backnine"
      ) {
        setTheme(stored);
      }
    } catch {}
  }, []);

  const choose = (next: ThemeId) => {
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "fairway") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  // Render Fairway as active until mounted so SSR markup matches the default.
  const active: ThemeId = mounted ? theme : "fairway";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Appearance
          </h2>
          <p className="text-[11px] text-mute mt-1">
            Switches the whole app. Saved to this device.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {THEMES.map((t) => (
          <ThemeButton
            key={t.id}
            label={t.label}
            sub={t.sub}
            swatch={t.swatch}
            active={active === t.id}
            onClick={() => choose(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeButton({
  label,
  sub,
  swatch,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  swatch: { bg: string; accent: string; ink: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex items-center gap-3 rounded-md border px-3 py-3 transition-colors text-left " +
        (active
          ? "border-accent bg-accent/10 text-ink"
          : "border-border bg-panel2 text-mute hover:text-ink")
      }
    >
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0 border"
        style={{
          width: 36,
          height: 36,
          background: swatch.bg,
          borderColor: swatch.accent,
        }}
        aria-hidden
      >
        <span
          className="font-mono text-[11px] font-semibold"
          style={{ color: swatch.accent }}
        >
          18
        </span>
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70 leading-tight mt-0.5">
          {sub}
        </span>
      </span>
    </button>
  );
}
