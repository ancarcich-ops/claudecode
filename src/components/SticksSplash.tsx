"use client";

import { useEffect, useState } from "react";
import styles from "./SticksSplash.module.css";

// Three-club geometry from the brand kit. Each path is rendered with
// the inner translate+flip from the source SVG so the heads sit at
// the TOP of each shaft. For the splash rise animation we wrap each
// in an additional <g> whose transform-origin is the shaft tip
// (rendered bottom of the club) so the club appears to grow up out
// of the baseline rather than from the SVG centroid.
const CLUBS = [
  // iron (left) -- shaft tip lands at y ~54 in the rendered 64-grid
  // after the flip
  {
    d: "M 19.1 14.60 Q 19.1 14.00 18.50 14.00 L 15.50 14.00 Q 14.9 14.00 14.9 14.60 L 14.9 47.19 C 14.9 49.19, 11.60 47.49, 7.18 49.90 C 7.18 52.61, 7.68 54.00, 9.38 54.00 C 13.56 54.10, 17.30 53.80, 19.1 51.16 C 19.1 49.27, 19.1 48.19, 19.1 46.89 L 19.1 14.60 Z",
    flipY: 68,
    originX: 17,
    originY: 54,
  },
  // driver (center, tallest) -- shaft tip ~56
  {
    d: "M 34.1 6.60 Q 34.1 6.00 33.50 6.00 L 30.50 6.00 Q 29.9 6.00 29.9 6.60 L 29.9 48.26 C 29.9 50.26, 25.73 48.56, 20.60 51.29 C 20.60 54.41, 21.10 56.00, 22.80 56.00 C 28.01 56.10, 32.30 55.80, 34.1 52.74 C 34.1 50.57, 34.1 49.26, 34.1 47.96 L 34.1 6.60 Z",
    flipY: 62,
    originX: 32,
    originY: 56,
  },
  // wedge (right, shortest) -- shaft tip ~50
  {
    d: "M 49.1 22.60 Q 49.1 22.00 48.50 22.00 L 45.50 22.00 Q 44.9 22.00 44.9 22.60 L 44.9 43.55 C 44.9 45.55, 42.31 43.85, 38.47 46.13 C 38.47 48.69, 38.97 50.00, 40.67 50.00 C 44.01 50.10, 47.30 49.80, 49.1 47.32 C 49.1 45.54, 49.1 44.55, 49.1 43.25 L 49.1 22.60 Z",
    flipY: 72,
    originX: 47,
    originY: 50,
  },
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
        {CLUBS.map((c, i) => (
          <g
            key={i}
            style={{
              transformOrigin: `${c.originX}px ${c.originY}px`,
              animation: `sticksRise 1.4s ${i * 0.14}s cubic-bezier(.2,.7,.3,1) both`,
            }}
          >
            <g transform={`translate(0 ${c.flipY}) scale(1 -1)`}>
              <path
                d={c.d}
                fill="#34d399"
                stroke="#34d399"
                strokeWidth={0.4}
                strokeLinejoin="round"
              />
            </g>
          </g>
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
