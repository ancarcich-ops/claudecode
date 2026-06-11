// Tournament-level win odds. For each roster member we project a
// total score = (sum of completed-round scores) + (expected score on
// the remaining rounds, derived from handicap). Then softmax against
// negative totals so the lowest projected total has the highest
// chance to win.
//
// Intentionally simple -- not a Monte Carlo. The point is "who's the
// favorite right now" not a USGA-grade projection. For the rounds
// already in the books we use the real net/gross totals; for what's
// left we assume each remaining round comes in at par + handicap (NET
// scoring) or roughly the player's typical gross (handicap + course
// par, GROSS scoring). A single softmax temperature absorbs the
// uncertainty.
//
// Used on /tournaments/[id] in the Odds tab next to Leaderboard.

import { prisma } from "./db";
import type {
  LeaderboardRow,
  TournamentScoringMode,
} from "./tournaments";

export type TournamentOddsRow = {
  rank: number;
  displayName: string;
  latestHandicap: number | null;
  // Per-round score: same shape as the leaderboard. Drives the small
  // "thru R1" annotation on the odds row.
  roundScores: (number | null)[];
  // Cumulative score so far (only counts completed rounds).
  scoreSoFar: number;
  // Rounds the player has actually played a score in.
  playedRounds: number;
  // Total rounds planned for the tournament.
  roundsPlanned: number;
  // Projected total score by end of tournament. Lower = better.
  projectedTotal: number;
  // 0..1 -- chance to finish first overall.
  winProbability: number;
};

// Softmax "spread" -- higher = more uncertainty (probabilities flatter
// toward equal). 4.5 strokes is roughly the round-to-round noise of a
// mid-handicap player; good enough that one bad round doesn't bury
// the rest of the field at 0%.
const SOFTMAX_TEMPERATURE = 4.5;

// Average gross strokes a typical 18-hole par-72 round comes in at
// for a player with the given handicap. Used to project unplayed
// rounds in GROSS mode -- net mode subtracts the handicap right back
// off so the constant cancels and the projection collapses to par.
const ASSUMED_COURSE_PAR = 72;

export async function computeTournamentWinOdds(
  tournamentId: string,
): Promise<TournamentOddsRow[]> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      roster: { orderBy: { createdAt: "asc" } },
      matches: {
        orderBy: { roundNumber: "asc" },
        include: {
          players: {
            include: {
              scores: { select: { strokes: true } },
            },
          },
        },
      },
    },
  });
  if (!tournament) return [];

  const useNet =
    (tournament.scoringMode as TournamentScoringMode) === "NET";
  const rounds = tournament.matches.filter((m) => m.roundNumber != null);

  // Build the working per-player state. Mirrors the leaderboard
  // computation in tournaments.ts -- key by lowercased displayName
  // since roster + match-player don't share an id.
  type Working = {
    displayName: string;
    latestHandicap: number | null;
    // roundNumber -> net/gross score so far (null when round not yet
    // completed but the player has scores in flight)
    perRound: Map<number, number | null>;
  };
  const byName = new Map<string, Working>();
  const canonical = (s: string) => s.trim().toLowerCase();

  for (const r of tournament.roster) {
    byName.set(canonical(r.displayName), {
      displayName: r.displayName,
      latestHandicap: r.handicapAtStart,
      perRound: new Map(),
    });
  }

  for (const m of rounds) {
    const roundNo = m.roundNumber as number;
    for (const p of m.players) {
      const key = canonical(p.displayName);
      let entry = byName.get(key);
      if (!entry) {
        entry = {
          displayName: p.displayName,
          latestHandicap: p.handicap,
          perRound: new Map(),
        };
        byName.set(key, entry);
      } else {
        entry.latestHandicap = p.handicap;
      }
      const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
      // Live rollup: any holes scored counts. Mirrors the leaderboard
      // so the odds tab agrees with what the player sees.
      if (p.scores.length === 0 && m.status !== "COMPLETED") {
        entry.perRound.set(roundNo, null);
        continue;
      }
      const value = useNet ? gross - p.handicap : gross;
      entry.perRound.set(roundNo, value);
    }
  }

  const roundNumbers = Array.from(
    new Set(rounds.map((m) => m.roundNumber as number)),
  ).sort((a, b) => a - b);
  const roundCount = roundNumbers.length;
  const roundsPlanned = Math.max(tournament.roundsPlanned, roundCount);

  // First pass: build the rows + project per-player totals so the
  // softmax has something to chew on.
  type Pre = {
    displayName: string;
    latestHandicap: number | null;
    roundScores: (number | null)[];
    scoreSoFar: number;
    playedRounds: number;
    projectedTotal: number;
  };
  const pre: Pre[] = Array.from(byName.values()).map((w) => {
    const roundScores = roundNumbers.map((n) => w.perRound.get(n) ?? null);
    const playedRounds = roundScores.filter((n) => n != null).length;
    const scoreSoFar = roundScores.reduce<number>(
      (s, n) => s + (n ?? 0),
      0,
    );
    const roundsRemaining = Math.max(0, roundsPlanned - playedRounds);
    // Per-round projection. NET: par-on-the-card -> 0 over par. GROSS:
    // course par + handicap. Tournament leaderboard uses match
    // scoringMode but the projection lives in the same space as
    // scoreSoFar, so the units match.
    const perRoundProjection = useNet
      ? 0
      : ASSUMED_COURSE_PAR + (w.latestHandicap ?? 0);
    const projectedTotal =
      scoreSoFar + roundsRemaining * perRoundProjection;
    return {
      displayName: w.displayName,
      latestHandicap: w.latestHandicap,
      roundScores,
      scoreSoFar,
      playedRounds,
      projectedTotal,
    };
  });

  // Softmax. Lower projectedTotal -> higher probability, so we feed
  // -projectedTotal to softmax with a temperature that smooths the
  // round-to-round noise.
  const totals = pre.map((p) => -p.projectedTotal);
  const max = Math.max(...totals, 0);
  const exps = totals.map((t) => Math.exp((t - max) / SOFTMAX_TEMPERATURE));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
  const probs = exps.map((e) => e / sumExp);

  // For COMPLETED tournaments collapse to 100% on the leader so the
  // recap reads cleanly -- a settled tournament has no remaining
  // uncertainty.
  const isCompleted = tournament.status === "COMPLETED";
  let collapsed = probs;
  if (isCompleted && pre.length > 0) {
    // Find row(s) with the minimum projected total (ties allowed).
    const minTotal = Math.min(...pre.map((p) => p.projectedTotal));
    const winners = pre
      .map((p, i) => ({ i, total: p.projectedTotal }))
      .filter((x) => x.total === minTotal);
    const share = 1 / winners.length;
    collapsed = probs.map((_, i) =>
      winners.some((w) => w.i === i) ? share : 0,
    );
  }

  // Rank by probability descending, then by projected total ascending
  // (tiebreak on the model so two players at the same % don't shuffle
  // arbitrarily).
  const indexed = pre.map((p, i) => ({
    ...p,
    winProbability: collapsed[i],
  }));
  indexed.sort((a, b) => {
    if (b.winProbability !== a.winProbability)
      return b.winProbability - a.winProbability;
    if (a.projectedTotal !== b.projectedTotal)
      return a.projectedTotal - b.projectedTotal;
    return a.displayName.localeCompare(b.displayName);
  });

  // Assign ranks with ties getting the same number (1922-style).
  let lastProb: number | null = null;
  let lastRank = 0;
  const out: TournamentOddsRow[] = [];
  indexed.forEach((row, i) => {
    const rank =
      lastProb !== null && row.winProbability === lastProb
        ? lastRank
        : i + 1;
    lastRank = rank;
    lastProb = row.winProbability;
    out.push({
      rank,
      displayName: row.displayName,
      latestHandicap: row.latestHandicap,
      roundScores: row.roundScores,
      scoreSoFar: row.scoreSoFar,
      playedRounds: row.playedRounds,
      roundsPlanned,
      projectedTotal: row.projectedTotal,
      winProbability: row.winProbability,
    });
  });

  return out;
}

// Helper used by the leaderboard <-> odds tab: take an existing
// leaderboard row array and a per-displayName odds map.
export function oddsByDisplayName(
  rows: TournamentOddsRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.displayName, r.winProbability);
  return m;
}

// Re-export the leaderboard row type so callers that import the odds
// engine don't need a second import.
export type { LeaderboardRow };
