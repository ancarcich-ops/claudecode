// Simplified WHS-style handicap index, computed from logged rounds.
//
// We don't have Course Rating or Slope per round (the official WHS
// differential uses them), so the per-round differential is approximated
// as the 18-hole-equivalent score-over-par:
//
//   diff = (vsPar / holesPlayed) * 18
//
// From there we follow the WHS "best of X of last 20" table, multiply
// by the standard 0.96 bonus-of-excellence factor, and round to one
// decimal. This isn't GHIN-grade but tracks reality closely enough to
// be useful inside the app -- and updates the moment a round is logged.

import type { RoundSummary } from "./userStats";

// USGA's WHS table: given N rounds in the scoring record (capped at 20),
// take the lowest `count` differentials and subtract `adjust` strokes
// before applying the 0.96 factor. The adjustments only kick in at the
// very low end (< 6 rounds).
function bestOfTable(n: number): { count: number; adjust: number } {
  if (n <= 3) return { count: 1, adjust: 2.0 };
  if (n === 4) return { count: 1, adjust: 1.0 };
  if (n === 5) return { count: 1, adjust: 0 };
  if (n === 6) return { count: 2, adjust: 1.0 };
  if (n <= 8) return { count: 2, adjust: 0 };
  if (n <= 11) return { count: 3, adjust: 0 };
  if (n <= 14) return { count: 4, adjust: 0 };
  if (n <= 16) return { count: 5, adjust: 0 };
  if (n <= 18) return { count: 6, adjust: 0 };
  if (n === 19) return { count: 7, adjust: 0 };
  return { count: 8, adjust: 0 };
}

export type HandicapResult = {
  // The computed index, rounded to one decimal. Negative values stay negative.
  index: number;
  // How many rounds went into the calculation (capped at 20).
  fromRounds: number;
  // Total rounds available in the user's history.
  totalRounds: number;
};

export function computeHandicapIndex(
  rounds: RoundSummary[],
): HandicapResult | null {
  if (rounds.length < 3) return null;
  const recent = rounds.slice(-20);
  const diffs: number[] = [];
  for (const r of recent) {
    if (r.holesPlayed <= 0) continue;
    diffs.push((r.vsPar / r.holesPlayed) * 18);
  }
  if (diffs.length < 3) return null;
  diffs.sort((a, b) => a - b);
  const { count, adjust } = bestOfTable(diffs.length);
  const slice = diffs.slice(0, count);
  const avg = slice.reduce((a, b) => a + b, 0) / count;
  const index = Math.round((avg - adjust) * 0.96 * 10) / 10;
  return {
    index,
    fromRounds: diffs.length,
    totalRounds: rounds.length,
  };
}
