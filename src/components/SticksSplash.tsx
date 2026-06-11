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
  // iron (left, shortest) -- shaft tip lands at y ~54 in the rendered
  // 64-grid after the flip
  {
    d: "M 18.5 14.60 Q 18.5 14.00 17.90 14.00 L 16.10 14.00 Q 15.5 14.00 15.5 14.60 L 15.5 47.09 C 15.5 49.09, 11.51 47.39, 7.02 49.83 C 7.02 52.59, 7.52 54.00, 9.22 54.00 C 13.51 54.10, 17.30 53.80, 18.5 51.11 C 18.5 49.19, 18.5 48.09, 18.5 46.79 L 18.5 14.60 Z",
    flipY: 68,
    originX: 17,
    originY: 54,
  },
  // driver (center, tallest) -- shaft tip ~56
  {
    d: "M 33.5 6.60 Q 33.5 6.00 32.90 6.00 L 31.10 6.00 Q 30.5 6.00 30.5 6.60 L 30.5 48.14 C 30.5 50.14, 25.62 48.44, 20.40 51.22 C 20.40 54.38, 20.90 56.00, 22.60 56.00 C 27.94 56.10, 32.30 55.80, 33.5 52.69 C 33.5 50.48, 33.5 49.14, 33.5 47.84 L 33.5 6.60 Z",
    flipY: 62,
    originX: 32,
    originY: 56,
  },
  // wedge (right, mid) -- shaft tip ~50
  {
    d: "M 48.5 22.60 Q 48.5 22.00 47.90 22.00 L 46.10 22.00 Q 45.5 22.00 45.5 22.60 L 45.5 43.45 C 45.5 45.45, 42.23 43.75, 38.33 46.07 C 38.33 48.67, 38.83 50.00, 40.53 50.00 C 43.97 50.10, 47.30 49.80, 48.5 47.28 C 48.5 45.46, 48.5 44.45, 48.5 43.15 L 48.5 22.60 Z",
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
