"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "sticks-theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

// In-page theme switcher. Persists to localStorage, applies the data-theme
// attribute immediately. The matching pre-paint script in layout.tsx reads
// the same key so reloads land on the right palette without a flash.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light") setTheme("light");
    } catch {}
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "dark") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  // Render the dark state until mounted so SSR markup matches the default.
  const active: Theme = mounted ? theme : "dark";

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
      <div className="grid grid-cols-2 gap-2">
        <ThemeButton
          label="Dark"
          sub="Default"
          active={active === "dark"}
          onClick={() => choose("dark")}
          icon={<MoonIcon />}
        />
        <ThemeButton
          label="Light"
          sub="Daytime"
          active={active === "light"}
          onClick={() => choose("light")}
          icon={<SunIcon />}
        />
      </div>
    </div>
  );
}

function ThemeButton({
  label,
  sub,
  active,
  onClick,
  icon,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
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
      <span className={active ? "text-accent" : "text-mute"}>{icon}</span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70 leading-tight mt-0.5">
          {sub}
        </span>
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
