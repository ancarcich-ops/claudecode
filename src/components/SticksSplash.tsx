"use client";

import { useEffect, useState } from "react";
import styles from "./SticksSplash.module.css";

// Three-bar candlestick mark from the loading-screen spec. Each bar
// rises from its own bottom-center as if a candle's closing tick is
// finishing. transform-origin is set inline (not in CSS) because the
// origin is unique per bar; the keyframe + stagger come from the
// shared sticksRise animation in the module CSS.
const BARS = [
  // left -- shortest
  { x: 10, y: 26, height: 32, originX: 16, delay: "0s" },
  // middle -- tallest
  { x: 26, y: 10, height: 48, originX: 32, delay: ".14s" },
  // right -- mid
  { x: 42, y: 20, height: 38, originX: 48, delay: ".28s" },
];
const BAR_BOTTOM = 58;
const BAR_WIDTH = 12;
const BAR_RADIUS = 2.5;

// Once shown per browser session -- a returning visitor on a client-
// side navigation shouldn't re-see the splash for every nav. Key is
// bumped if we ever re-cut the timing / branding so a returning
// session re-sees the new mark.
const SESSION_KEY = "sticks-splash-shown-v2";

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
        {BARS.map((b, i) => (
          <rect
            key={i}
            className={styles.bar}
            x={b.x}
            y={b.y}
            width={BAR_WIDTH}
            height={b.height}
            rx={BAR_RADIUS}
            style={{
              transformOrigin: `${b.originX}px ${BAR_BOTTOM}px`,
              animationDelay: b.delay,
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
        <div className={styles.taglineEm}>One app.</div>
      </div>
    </div>
  );
}
