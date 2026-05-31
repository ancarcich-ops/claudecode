"use client";

import { useEffect, useState } from "react";
import styles from "./SticksSplash.module.css";

// Three-bar candlestick geometry. Each bar's transform-origin lives
// at its own bottom-center so the rise animation looks anchored to
// the baseline rather than the SVG centroid.
const bars = [
  { x: 10, y: 26, h: 32 },
  { x: 26, y: 10, h: 48 },
  { x: 42, y: 20, h: 38 },
];

// Once shown per browser session -- a returning visitor on a client-
// side navigation shouldn't re-see the splash for every nav. Key is
// bumped if we ever re-cut the timing / branding so a returning
// session re-sees the new mark.
const SESSION_KEY = "sticks-splash-shown-v1";

// Total time we hold the splash before fading. Long enough for the
// bars to finish rising and the wordmark + tagline to read; trimmed
// from 2.8s to feel snappier on cold load.
const HOLD_MS = 1500;
// Opacity fade-out -- short, since the underlying app shell is
// already rendered behind the overlay.
const FADE_MS = 240;

export default function SticksSplash() {
  // mount === undefined during SSR + first paint -- we only know
  // whether to render after we've checked sessionStorage on the
  // client. Renders null during that brief window so the splash
  // doesn't flash on already-seen sessions.
  const [mount, setMount] = useState<null | "showing" | "fading">(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // private mode / disabled storage -- fall through and show
      // the splash every cold load, which is acceptable.
    }
    if (seen) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    setMount("showing");
    const fadeT = window.setTimeout(() => setMount("fading"), HOLD_MS);
    const removeT = window.setTimeout(
      () => setMount(null),
      HOLD_MS + FADE_MS,
    );
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(removeT);
    };
  }, []);

  if (mount === null) return null;

  return (
    <div
      className={
        styles.splash + " " + (mount === "fading" ? styles.fading : "")
      }
      aria-hidden={mount === "fading"}
    >
      <div className={styles.grid} aria-hidden />

      <svg
        className={styles.mark}
        viewBox="0 0 64 64"
        aria-label="Sticks"
      >
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={12}
            height={b.h}
            rx={2.5}
            fill="#34d399"
            style={{
              transformOrigin: `${b.x + 6}px ${b.y + b.h}px`,
              animation: `sticksRise 1.4s ${i * 0.14}s cubic-bezier(.2,.7,.3,1) both`,
            }}
          />
        ))}
      </svg>

      <div className={styles.wordmark}>
        <span>sticks</span>
        <span className={styles.dot} />
      </div>

      <div className={styles.tagline}>
        <div>All your games.</div>
        <div className={styles.taglineEm}>One place.</div>
      </div>
    </div>
  );
}
