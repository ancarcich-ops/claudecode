// Sticks Index trend derivations for the stats hero: the sparkline
// trajectory (index as of each recent round) and the 30-day delta.
// Both replay computeHandicapIndex over chronological prefixes of the
// round history -- no stored snapshots, always consistent with the
// live index.

import { computeHandicapIndex } from "./handicap";
import type { RoundSummary } from "./userStats";

export type IndexTrend = {
  // Index value as of each of the last N computable rounds (oldest
  // first, ending at the current index). Empty when the index is
  // still pending (< 3 rounds).
  trajectory: number[];
  // Current index minus the index as of 30 days ago. Null when there
  // weren't enough rounds 30 days ago to compute one. Negative =
  // the index dropped (improvement).
  delta30: number | null;
};

const TRAJECTORY_POINTS = 10;

export function computeIndexTrend(rounds: RoundSummary[]): IndexTrend {
  // rounds arrive chronological (oldest first) from computeUserStats.
  const trajectory: number[] = [];
  const start = Math.max(0, rounds.length - TRAJECTORY_POINTS);
  for (let i = start; i < rounds.length; i++) {
    const at = computeHandicapIndex(rounds.slice(0, i + 1));
    if (at) trajectory.push(at.index);
  }

  let delta30: number | null = null;
  const current = computeHandicapIndex(rounds);
  if (current) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const priorRounds = rounds.filter(
      (r) => new Date(r.scheduledAt).getTime() <= cutoff,
    );
    const prior = computeHandicapIndex(priorRounds);
    if (prior) {
      delta30 = Math.round((current.index - prior.index) * 10) / 10;
    }
  }

  return { trajectory, delta30 };
}
