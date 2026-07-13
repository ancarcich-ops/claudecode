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
import { scoreDifferential } from "./courseRating";

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

// The 0.96 "Bonus of Excellence" multiplier applied to the average of the
// best differentials.
export const BONUS_OF_EXCELLENCE = 0.96;

// Per-round view of the handicap math, for the /stats explainer and the
// handicap diagnostic. One entry per round that fed the calculation.
export type HandicapRoundDetail = {
  matchId: string;
  courseName: string;
  holesPlayed: number;
  gross: number;
  vsPar: number;
  rating: number | null;
  slope: number | null;
  differential: number; // rounded to 1 decimal for display
  method: "WHS" | "score-only";
  used: boolean; // true when this round is one of the "best N" counted
};

export type HandicapBreakdown = {
  perRound: HandicapRoundDetail[]; // chronological (oldest -> newest)
  usedCount: number; // "best N" per the WHS table
  adjust: number; // strokes subtracted (only for very short records)
  average: number; // mean of the used differentials, before adjust/0.96
  factor: number; // 0.96
  index: number;
  fromRounds: number;
  totalRounds: number;
};

function rawDifferential(r: RoundSummary): {
  value: number;
  method: "WHS" | "score-only";
} {
  // WHS Score Differential when the round carries a Course Rating + Slope
  // (18-hole rounds only for now). Otherwise fall back to the score-only
  // model: 18-hole-equivalent strokes over par.
  if (
    r.holesPlayed === 18 &&
    r.rating != null &&
    r.slope != null &&
    r.slope > 0
  ) {
    return { value: scoreDifferential(r.gross, r.rating, r.slope), method: "WHS" };
  }
  return { value: (r.vsPar / r.holesPlayed) * 18, method: "score-only" };
}

// Full, step-by-step handicap math for a scoring record. Returns null when
// there aren't enough rounds (WHS needs at least 3).
export function handicapBreakdown(
  rounds: RoundSummary[],
): HandicapBreakdown | null {
  if (rounds.length < 3) return null;
  const recent = rounds.slice(-20).filter((r) => r.holesPlayed > 0);
  if (recent.length < 3) return null;

  const detail = recent.map((r) => {
    const { value, method } = rawDifferential(r);
    return {
      round: r,
      raw: value,
      method,
      differential: Math.round(value * 10) / 10,
    };
  });

  const { count, adjust } = bestOfTable(detail.length);
  // The "best N" are the N lowest RAW differentials. Tag them, then keep
  // the list in chronological order for display.
  const usedRaws = [...detail]
    .sort((a, b) => a.raw - b.raw)
    .slice(0, count);
  const usedSet = new Set(usedRaws);
  const average = usedRaws.reduce((a, d) => a + d.raw, 0) / count;
  const index =
    Math.round((average - adjust) * BONUS_OF_EXCELLENCE * 10) / 10;

  return {
    perRound: detail.map((d) => ({
      matchId: d.round.matchId,
      courseName: d.round.courseName,
      holesPlayed: d.round.holesPlayed,
      gross: d.round.gross,
      vsPar: d.round.vsPar,
      rating: d.round.rating,
      slope: d.round.slope,
      differential: d.differential,
      method: d.method,
      used: usedSet.has(d),
    })),
    usedCount: count,
    adjust,
    average: Math.round(average * 100) / 100,
    factor: BONUS_OF_EXCELLENCE,
    index,
    fromRounds: detail.length,
    totalRounds: rounds.length,
  };
}

export function computeHandicapIndex(
  rounds: RoundSummary[],
): HandicapResult | null {
  const b = handicapBreakdown(rounds);
  if (!b) return null;
  return { index: b.index, fromRounds: b.fromRounds, totalRounds: b.totalRounds };
}
