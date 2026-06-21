"use client";

import { useEffect, useState } from "react";
import styles from "./SticksSplash.module.css";

// Locked Sticks brandmark -- three club silhouettes (heads at top,
// facing left). Each path is rendered with the inner translate+flip
// from the source SVG so the heads sit at the TOP of each shaft. The
// outer .club-anim group carries the entrance pop so the flip and
// the animation never fight each other.
const CLUBS = [
  // left -- iron
  {
    d: "M 19.57 14.60 Q 19.57 14.00 18.97 14.00 L 15.03 14.00 Q 14.43 14.00 14.43 14.60 L 14.43 46.10 C 14.43 48.10, 10.68 46.40, 5.50 49.19 C 5.50 52.37, 6.00 54.00, 7.70 54.00 C 12.98 54.10, 17.30 53.80, 19.57 50.67 C 19.57 48.45, 19.57 47.10, 19.57 45.80 L 19.57 14.60 Z",
    flipY: 68,
    delay: "0s",
  },
  // middle -- driver (tallest)
  {
    d: "M 34.57 6.60 Q 34.57 6.00 33.97 6.00 L 30.03 6.00 Q 29.43 6.00 29.43 6.60 L 29.43 47.00 C 29.43 49.00, 24.57 47.30, 18.50 50.48 C 18.50 54.13, 19.00 56.00, 20.70 56.00 C 27.27 56.10, 32.30 55.80, 34.57 52.17 C 34.57 49.63, 34.57 48.00, 34.57 46.70 L 34.57 6.60 Z",
    flipY: 62,
    delay: ".13s",
  },
  // right -- wedge (shortest)
  {
    d: "M 49.57 22.60 Q 49.57 22.00 48.97 22.00 L 45.03 22.00 Q 44.43 22.00 44.43 22.60 L 44.43 42.50 C 44.43 44.50, 41.50 42.80, 37.00 45.45 C 37.00 48.46, 37.50 50.00, 39.20 50.00 C 43.50 50.10, 47.30 49.80, 49.57 46.85 C 49.57 44.75, 49.57 43.50, 49.57 42.20 L 49.57 22.60 Z",
    flipY: 72,
    delay: ".26s",
  },
];

// Once shown per browser session -- a returning visitor on a client-
// side navigation shouldn't re-see the splash for every nav. Key is
// bumped when we re-cut the timing / branding so a returning session
// re-sees the new mark on its next cold load.
const SESSION_KEY = "sticks-splash-shown-v3";

// Total time we hold the splash before fading. Covers the staggered
// club pop-in (final club at ~1.08s) + the wordmark + tagline landing.
const HOLD_MS = 1600;
const FADE_MS = 240;

export default function SticksSplash() {
  // mount === null during SSR + first paint -- we only know whether
  // to render after we've checked sessionStorage on the client.
  // Renders null during that brief window so the splash doesn't flash
  // on already-seen sessions.
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
        {/* +4.5 X nudge from the brand kit -- left-facing heads
            otherwise crowd the left edge of the viewBox. */}
        <g transform="translate(4.5 0)">
          {CLUBS.map((c, i) => (
            <g
              key={i}
              className={styles.clubAnim}
              style={{ ["--d" as string]: c.delay }}
            >
              <g transform={`translate(0 ${c.flipY}) scale(1 -1)`}>
                <path className={styles.club} d={c.d} />
              </g>
            </g>
          ))}
        </g>
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
