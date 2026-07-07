import { prisma } from "./db";
import { parseParData } from "./odds";
import { normalizeCourseName } from "./courseAlias";
import { computeHandicapIndex, type HandicapResult } from "./handicap";
import {
  computeStableford,
  computeSkins,
  computeNassau,
  computeBbb,
  computeSnake,
  computeWolf,
  isBbbEventKind,
  isSnakeEventKind,
  isWolfEventKind,
  parseWolfConfig,
  type BbbEvent,
  type SnakeEvent,
  type WolfEvent,
} from "./sideGames";

// Personal stats: every match the user was linked to, regardless of group
// scoping. Unlike the group leaderboard, no "2+ from this group" filter --
// every game played is counted.

export type ParTypeStats = {
  holesPlayed: number;
  strokes: number;
  vsPar: number; // total strokes minus total par for those holes
  avgVsPar: number | null; // vsPar / holesPlayed (null if no holes)
  avgScore: number | null; // strokes / holesPlayed (null if no holes)
};

export type CourseBest = {
  courseName: string;
  matchId: string;
  gross: number;
  net: number;
  scheduledAt: Date;
};

// One entry per played round, in chronological order. vsPar is total
// strokes minus the par of the holes actually scored, so 9/12/18-hole
// rounds are directly comparable.
export type RoundSummary = {
  matchId: string;
  courseName: string;
  scheduledAt: Date;
  holesPlayed: number;
  vsPar: number;
  gross: number;
  // Course Rating + Slope for this round, for the WHS differential.
  // Priority: the player's snapshotted tee -> the course default ->
  // null (handicap falls back to the score-only model). Null on
  // 9-hole rounds and unrated courses.
  rating: number | null;
  slope: number | null;
};

// Lowest-vs-par round across the user's history. Used for the "Best"
// chip on /stats.
export type BestRound = {
  matchId: string;
  courseName: string;
  scheduledAt: Date;
  vsPar: number;
  gross: number;
  holesPlayed: number;
};

// Per-18-holes counts of each score category. Stats are accumulated as raw
// totals then normalized at the end so 9-hole rounds aren't double-weighted.
export type ScoreDistribution = {
  birdiesOrBetter: number;
  pars: number;
  bogeys: number;
  doublesOrWorse: number;
  totalHolesPlayed: number;
  // Same counts normalized to a full 18-hole round, for display.
  per18: {
    birdiesOrBetter: number;
    pars: number;
    bogeys: number;
    doublesOrWorse: number;
  };
};

export type UserStats = {
  userId: string;
  username: string;
  displayName: string | null;
  matchesPlayed: number;
  matchesWithScores: number;
  mainWins: number;
  stablefordWins: number;
  skinsWins: number;
  nassauWins: number;
  bbbWins: number;
  snakeWins: number;
  wolfWins: number;
  totalWins: number;
  // Hole-type breakdown, all par 3 / 4 / 5+ holes across every match
  par3: ParTypeStats;
  par4: ParTypeStats;
  par5: ParTypeStats;
  // Score-type counts across all holes, plus per-18-holes normalization.
  distribution: ScoreDistribution;
  // Per-round vs-par history, chronological (oldest first).
  rounds: RoundSummary[];
  // Best gross score per course
  courseRecords: CourseBest[];
  // Win streak: consecutive completed matches (in chronological order) where
  // this user was the main-game winner. currentStreak = ending at the most
  // recent match; bestStreak = longest run ever.
  currentMainStreak: number;
  bestMainStreak: number;
  // Auto-computed handicap index from logged rounds (null if too few rounds).
  handicap: HandicapResult | null;
  // Average gross score across the user's 18-hole rounds (null if none).
  avg18Gross: number | null;
  // Round with the lowest vs-par across all rounds (null if no rounds).
  bestRound: BestRound | null;
};

function emptyStats(par: 3 | 4 | 5): ParTypeStats {
  return {
    holesPlayed: 0,
    strokes: 0,
    vsPar: 0,
    avgVsPar: null,
    avgScore: null,
  };
}

function emptyDistribution(): ScoreDistribution {
  return {
    birdiesOrBetter: 0,
    pars: 0,
    bogeys: 0,
    doublesOrWorse: 0,
    totalHolesPlayed: 0,
    per18: { birdiesOrBetter: 0, pars: 0, bogeys: 0, doublesOrWorse: 0 },
  };
}

export async function computeUserStats(userId: string): Promise<UserStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true },
  });
  if (!user) return null;

  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETED",
      players: { some: { userId } },
    },
    orderBy: { completedAt: "asc" },
    include: {
      players: { include: { scores: true } },
      sideGames: { include: { events: true } },
    },
  });

  // Course-default Course Rating + Slope, keyed by course name, for
  // rounds whose player seat has no per-tee snapshot. One query over the
  // distinct courses in this history.
  const courseNames = Array.from(new Set(matches.map((m) => m.courseName)));
  const courseRatings = courseNames.length
    ? await prisma.course.findMany({
        where: { name: { in: courseNames } },
        select: { name: true, rating: true, slope: true },
      })
    : [];
  const ratingByCourse = new Map(
    courseRatings.map((c) => [c.name, { rating: c.rating, slope: c.slope }]),
  );

  const stats: UserStats = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    // Competitive stats below only count matches with 2+ players. Solo
    // rounds (single-player score-tracking entries) skew win-rate /
    // streak math since the only player always "wins". We re-set
    // matchesPlayed inside the loop so it reflects the same filter.
    matchesPlayed: 0,
    matchesWithScores: 0,
    mainWins: 0,
    stablefordWins: 0,
    skinsWins: 0,
    nassauWins: 0,
    bbbWins: 0,
    snakeWins: 0,
    wolfWins: 0,
    totalWins: 0,
    par3: emptyStats(3),
    par4: emptyStats(4),
    par5: emptyStats(5),
    distribution: emptyDistribution(),
    rounds: [],
    courseRecords: [],
    currentMainStreak: 0,
    bestMainStreak: 0,
    handicap: null,
    avg18Gross: null,
    bestRound: null,
  };

  const bestByCourse = new Map<string, CourseBest>();
  let runningStreak = 0;
  let bestStreak = 0;
  let lastResultWasWin = false;

  for (const match of matches) {
    if (match.players.length === 0) continue;
    const pars = parseParData(match.parData, match.holes);
    const scoringMode = match.scoringMode as "NET" | "GROSS" | "CUSTOM";
    const startingHole = match.startingHole ?? 1;

    const me = match.players.find((p) => p.userId === userId);
    if (!me) continue;

    // Solo rounds (single player) are personal score-tracking entries, not
    // competitions. Score-based analytics (rounds history, distribution,
    // course bests, handicap) still count every round; competitive stats
    // (matches played, wins, win-rate, streak, side-game wins) only count
    // matches with 2+ players.
    const isCompetitive = match.players.length >= 2;
    if (isCompetitive) stats.matchesPlayed++;

    if (me.scores.length > 0) {
      if (isCompetitive) stats.matchesWithScores++;

      // Per-hole bucketed performance + per-round vs-par accumulator.
      let roundVsPar = 0;
      for (const s of me.scores) {
        const par = pars[s.hole - startingHole] ?? 4;
        const bucket =
          par === 3 ? stats.par3 : par === 5 || par > 5 ? stats.par5 : stats.par4;
        bucket.holesPlayed++;
        bucket.strokes += s.strokes;
        bucket.vsPar += s.strokes - par;

        // Score-type distribution. Anything <= par-1 counts as birdie-or-better
        // (eagles fold in here -- they're rare enough to not warrant a column).
        const diff = s.strokes - par;
        stats.distribution.totalHolesPlayed++;
        if (diff <= -1) stats.distribution.birdiesOrBetter++;
        else if (diff === 0) stats.distribution.pars++;
        else if (diff === 1) stats.distribution.bogeys++;
        else stats.distribution.doublesOrWorse++;

        roundVsPar += diff;
      }

      const myGross = me.scores.reduce((a, x) => a + x.strokes, 0);
      // Rating/slope for the WHS differential: the player's snapshotted
      // tee wins, else the course default, else null (score-only model).
      const courseDefault = ratingByCourse.get(match.courseName);
      const roundRating = me.courseRating ?? courseDefault?.rating ?? null;
      const roundSlope = me.slope ?? courseDefault?.slope ?? null;
      stats.rounds.push({
        matchId: match.id,
        courseName: match.courseName,
        scheduledAt: match.scheduledAt,
        holesPlayed: me.scores.length,
        vsPar: roundVsPar,
        gross: myGross,
        rating: roundRating,
        slope: roundSlope,
      });

      // Course best (lowest gross). Tiebreak by net. Aliased course names
      // collapse to one entry so the same course played with slightly
      // different spellings doesn't show up twice.
      const allowance = scoringMode === "GROSS" ? 0 : me.handicap;
      const myNet = myGross - allowance;
      const canonicalCourse = normalizeCourseName(match.courseName);
      const existing = bestByCourse.get(canonicalCourse);
      if (!existing || myGross < existing.gross) {
        bestByCourse.set(canonicalCourse, {
          courseName: canonicalCourse,
          matchId: match.id,
          gross: myGross,
          net: myNet,
          scheduledAt: match.scheduledAt,
        });
      }
    }

    // Main-game win: lowest net (or gross). Ties = shared win. Solo rounds
    // skip this entirely -- a one-player "match" is always trivially won
    // and would inflate win rate / streak.
    if (!isCompetitive) continue;

    const finalNets = match.players.map((p) => {
      const total = p.scores.reduce((s, x) => s + x.strokes, 0);
      const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
      return {
        userId: p.userId,
        net: total - allowance,
        hasScores: p.scores.length > 0,
      };
    });
    const scored = finalNets.filter((n) => n.hasScores);
    let wonThisMatch = false;
    if (scored.length > 0) {
      const min = Math.min(...scored.map((n) => n.net));
      for (const n of scored) {
        if (n.net === min && n.userId === userId) {
          stats.mainWins++;
          wonThisMatch = true;
        }
      }
    }
    if (wonThisMatch) {
      runningStreak = lastResultWasWin ? runningStreak + 1 : 1;
      lastResultWasWin = true;
      if (runningStreak > bestStreak) bestStreak = runningStreak;
    } else if (scored.length > 0) {
      // A scored, settled match where we didn't win breaks the streak.
      runningStreak = 0;
      lastResultWasWin = false;
    }

    // Side-game wins -- mirror the rules from computeGroupLeaderboard but
    // checking if WE are a leader.
    const sgPlayers = match.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      handicap: p.handicap,
      scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
    }));
    const seatedPlayers = match.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      displayName: p.displayName,
      handicap: p.handicap,
      scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
    }));
    const myMatchPlayerId = me.id;
    const wins = (leaderPlayerIds: Set<string>) =>
      leaderPlayerIds.has(myMatchPlayerId);

    for (const sg of match.sideGames) {
      const leaderIds = (lb: { rows: { playerId: string; isLeader: boolean }[] }) =>
        new Set(lb.rows.filter((r) => r.isLeader).map((r) => r.playerId));
      if (sg.kind === "STABLEFORD") {
        const lb = computeStableford(
          sgPlayers,
          pars,
          match.holes,
          scoringMode,
          startingHole,
        );
        if (wins(leaderIds(lb))) stats.stablefordWins++;
      } else if (sg.kind === "SKINS") {
        const lb = computeSkins(
          sgPlayers,
          pars,
          match.holes,
          scoringMode,
          startingHole,
        );
        if (wins(leaderIds(lb))) stats.skinsWins++;
      } else if (sg.kind === "NASSAU" && match.holes === 18) {
        const segs = computeNassau(sgPlayers, pars, match.holes, scoringMode);
        const total = segs.find((s) => s.key === "NASSAU_TOTAL");
        if (total && wins(leaderIds(total))) stats.nassauWins++;
      } else if (sg.kind === "BBB") {
        const events: BbbEvent[] = sg.events
          .filter((e) => isBbbEventKind(e.kind))
          .map((e) => ({
            hole: e.hole,
            kind: e.kind as BbbEvent["kind"],
            matchPlayerId: e.matchPlayerId ?? null,
          }));
        const lb = computeBbb(sgPlayers, events);
        if (wins(leaderIds(lb))) stats.bbbWins++;
      } else if (sg.kind === "SNAKE") {
        const events: SnakeEvent[] = sg.events
          .filter((e) => isSnakeEventKind(e.kind) && e.matchPlayerId)
          .map((e) => ({
            hole: e.hole,
            matchPlayerId: e.matchPlayerId as string,
          }));
        const lb = computeSnake(sgPlayers, events);
        if (wins(leaderIds(lb))) stats.snakeWins++;
      } else if (sg.kind === "WOLF") {
        const events: WolfEvent[] = sg.events
          .filter((e) => isWolfEventKind(e.kind))
          .map((e) => ({
            hole: e.hole,
            kind: e.kind as WolfEvent["kind"],
            matchPlayerId: e.matchPlayerId ?? null,
          }));
        const config = parseWolfConfig(sg.config);
        const lb = computeWolf(
          seatedPlayers,
          match.holes,
          events,
          config,
          startingHole,
        );
        if (wins(leaderIds(lb))) stats.wolfWins++;
      }
    }
  }

  // Finalize averages
  for (const b of [stats.par3, stats.par4, stats.par5]) {
    b.avgVsPar = b.holesPlayed === 0 ? null : b.vsPar / b.holesPlayed;
    b.avgScore = b.holesPlayed === 0 ? null : b.strokes / b.holesPlayed;
  }
  const d = stats.distribution;
  if (d.totalHolesPlayed > 0) {
    const k = 18 / d.totalHolesPlayed;
    d.per18 = {
      birdiesOrBetter: d.birdiesOrBetter * k,
      pars: d.pars * k,
      bogeys: d.bogeys * k,
      doublesOrWorse: d.doublesOrWorse * k,
    };
  }
  stats.totalWins =
    stats.mainWins +
    stats.stablefordWins +
    stats.skinsWins +
    stats.nassauWins +
    stats.bbbWins +
    stats.snakeWins +
    stats.wolfWins;
  stats.currentMainStreak = runningStreak;
  stats.bestMainStreak = bestStreak;
  stats.courseRecords = Array.from(bestByCourse.values()).sort(
    (a, b) => a.gross - b.gross,
  );
  stats.handicap = computeHandicapIndex(stats.rounds);

  // Average gross score across 18-hole rounds only -- mixing 9 and 18
  // hole rounds would make this meaningless. Null if the user has never
  // posted an 18-hole round.
  const eighteens = stats.rounds.filter((r) => r.holesPlayed === 18);
  stats.avg18Gross =
    eighteens.length === 0
      ? null
      : eighteens.reduce((s, r) => s + r.gross, 0) / eighteens.length;

  // Personal best round = lowest vs-par across the entire history.
  // Tiebreak by gross (then most recent) so two -3 rounds prefer the one
  // shot on the harder par.
  if (stats.rounds.length > 0) {
    const sorted = [...stats.rounds].sort(
      (a, b) =>
        a.vsPar - b.vsPar ||
        a.gross - b.gross ||
        b.scheduledAt.getTime() - a.scheduledAt.getTime(),
    );
    const r = sorted[0];
    stats.bestRound = {
      matchId: r.matchId,
      courseName: r.courseName,
      scheduledAt: r.scheduledAt,
      vsPar: r.vsPar,
      gross: r.gross,
      holesPlayed: r.holesPlayed,
    };
  }

  return stats;
}
