import { prisma } from "./db";
import { parseParData } from "./odds";
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
  // Best gross score per course
  courseRecords: CourseBest[];
  // Win streak: consecutive completed matches (in chronological order) where
  // this user was the main-game winner. currentStreak = ending at the most
  // recent match; bestStreak = longest run ever.
  currentMainStreak: number;
  bestMainStreak: number;
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

  const stats: UserStats = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    matchesPlayed: matches.length,
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
    courseRecords: [],
    currentMainStreak: 0,
    bestMainStreak: 0,
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

    if (me.scores.length > 0) {
      stats.matchesWithScores++;

      // Per-hole bucketed performance.
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
      }

      // Course best (lowest gross). Tiebreak by net.
      const myGross = me.scores.reduce((a, x) => a + x.strokes, 0);
      const allowance = scoringMode === "GROSS" ? 0 : me.handicap;
      const myNet = myGross - allowance;
      const existing = bestByCourse.get(match.courseName);
      if (!existing || myGross < existing.gross) {
        bestByCourse.set(match.courseName, {
          courseName: match.courseName,
          matchId: match.id,
          gross: myGross,
          net: myNet,
          scheduledAt: match.scheduledAt,
        });
      }
    }

    // Main-game win: lowest net (or gross). Ties = shared win.
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

  return stats;
}
