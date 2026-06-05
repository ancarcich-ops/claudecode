// Tournament read helpers. Server actions live in `actions.ts`; this
// file just collects the queries + the leaderboard rollup math so the
// detail / leaderboard pages can stay slim.

import { prisma } from "./db";

export type TournamentStatus = "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
export type TournamentScoringMode = "NET" | "GROSS";

// Per-player line on the cumulative leaderboard. `roundScores` holds
// the per-round result -- null when the player didn't play that round
// (DNP) or when the round hasn't finished yet. `total` is the sum of
// the non-null entries, used for sort order. `playedRounds` is the
// count of non-null entries; the UI uses it to mark partials.
export type LeaderboardRow = {
  rank: number;
  playerId: string;
  displayName: string;
  // Match-player handicap from each round, latest first. Used to label
  // the row with "HCP 12.4" etc.
  latestHandicap: number | null;
  roundScores: (number | null)[];
  total: number;
  playedRounds: number;
};

// Pull a tournament + its child matches (just the basics; player
// detail is loaded in the round pages). Returns null if not found.
// Pulls per-match players so the detail page can list each foursome's
// participants without an N+1.
export async function getTournamentById(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    include: {
      roster: { orderBy: { createdAt: "asc" } },
      matches: {
        orderBy: [{ roundNumber: "asc" }, { scheduledAt: "asc" }],
        select: {
          id: true,
          courseName: true,
          scheduledAt: true,
          status: true,
          roundNumber: true,
          completedAt: true,
          players: {
            orderBy: { seat: "asc" },
            select: {
              id: true,
              displayName: true,
              userId: true,
            },
          },
        },
      },
      group: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, username: true, displayName: true } },
    },
  });
}

// List a group's tournaments. Used on the group page's Tournaments
// tab. Returns the freshest first so an active event is at the top.
export async function listTournamentsForGroup(groupId: string) {
  return prisma.tournament.findMany({
    where: { groupId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      roster: { select: { id: true } },
      matches: { select: { id: true, status: true } },
    },
  });
}

// Tournaments the user is involved in, regardless of group: either
// created or rostered. Used by the homepage Tournaments section so a
// "send a code, anyone joins" tournament (no group) surfaces alongside
// group-scoped ones. Sort orders UPCOMING/IN_PROGRESS before COMPLETED,
// then freshest first.
export async function listTournamentsForUser(userId: string) {
  return prisma.tournament.findMany({
    where: {
      OR: [
        { createdById: userId },
        { roster: { some: { userId } } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      roster: { select: { id: true } },
      matches: { select: { id: true, status: true } },
    },
  });
}

// Compute the cumulative leaderboard for a tournament. Pulls every
// completed child match's per-player totals and rolls them up
// according to the tournament's scoringMode. Players who missed
// rounds get null entries for those rounds and sink in the sort.
//
// Semantics:
//   - NET: per-round net score = gross strokes - per-round handicap
//   - GROSS: per-round score = gross strokes only
//   - Skipped round (no MatchPlayer for that player in that match) =
//     null entry, contributes 0 to the sort total but reduces
//     playedRounds. Players with fewer playedRounds rank below
//     players with more played, all else equal.
//   - A round may contain multiple foursomes (matches sharing the
//     same roundNumber). Each player is in exactly one foursome per
//     round, so the column collapses to one cell per round.
export async function computeTournamentLeaderboard(
  tournamentId: string,
): Promise<LeaderboardRow[]> {
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

  // Index per-player results across the rounds. Key by displayName
  // since roster + match players don't share an id; we match on the
  // free-typed name (canonicalized to lower-case).
  type Working = {
    displayName: string;
    latestHandicap: number | null;
    perRound: Map<number, number | null>; // roundNumber -> net/gross
  };
  const byName = new Map<string, Working>();
  const canonical = (s: string) => s.trim().toLowerCase();

  // Seed with the roster so players show even before any rounds
  // have results.
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
      // Only score completed matches; in-progress rounds show as
      // null so the leaderboard reflects "completed so far".
      if (m.status !== "COMPLETED") {
        entry.perRound.set(roundNo, null);
        continue;
      }
      const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
      const value = useNet ? gross - p.handicap : gross;
      entry.perRound.set(roundNo, value);
    }
  }

  // Distinct round numbers in ascending order. Without the dedupe, a
  // round with 4 foursomes would produce 4 identical R1 columns.
  const roundNumbers = Array.from(
    new Set(rounds.map((m) => m.roundNumber as number)),
  ).sort((a, b) => a - b);

  const raw: LeaderboardRow[] = Array.from(byName.values()).map((w) => {
    const roundScores = roundNumbers.map(
      (n) => w.perRound.get(n) ?? null,
    );
    const total = roundScores.reduce((s: number, n) => s + (n ?? 0), 0);
    const playedRounds = roundScores.filter((n) => n != null).length;
    return {
      rank: 0,
      playerId: w.displayName,
      displayName: w.displayName,
      latestHandicap: w.latestHandicap,
      roundScores,
      total,
      playedRounds,
    };
  });

  // Sort: more played-rounds first, then lower total. Stable tiebreak
  // on display name keeps the order deterministic.
  raw.sort((a, b) => {
    if (a.playedRounds !== b.playedRounds)
      return b.playedRounds - a.playedRounds;
    if (a.total !== b.total) return a.total - b.total;
    return a.displayName.localeCompare(b.displayName);
  });

  // Assign ranks with ties getting the same number, 1922-style: 1, 1,
  // 3 rather than 1, 2, 3 if the first two are tied.
  let lastTotal: number | null = null;
  let lastPlayed: number | null = null;
  let lastRank = 0;
  raw.forEach((row, i) => {
    if (
      lastTotal !== null &&
      lastPlayed !== null &&
      row.total === lastTotal &&
      row.playedRounds === lastPlayed
    ) {
      row.rank = lastRank;
    } else {
      row.rank = i + 1;
      lastRank = row.rank;
    }
    lastTotal = row.total;
    lastPlayed = row.playedRounds;
  });

  return raw;
}
