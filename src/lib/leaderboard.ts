import { prisma } from "./db";
import { parseParData } from "./odds";
import { computeTournamentLeaderboard } from "./tournaments";
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
  type BbbEvent,
  type SnakeEvent,
  type WolfEvent,
  type Leaderboard,
} from "./sideGames";

// Per-user aggregated stats for a single group. Derived live from the
// group's completed matches -- no persistence yet. Trade-off documented
// in the leaderboard PR: this scans every completed match each time the
// page renders, which is fine through a few hundred matches; persist at
// match-completion time when that becomes a real bottleneck.
export type LeaderboardRow = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarSeed: string | null;
  avatarVariant: string | null;
  avatarUrl: string | null;
  matchesPlayed: number;
  // One column per game type. A "win" = leader (ties = co-winners).
  mainWins: number;
  stablefordWins: number;
  skinsWins: number;
  nassauWins: number; // Total segment only -- F9/B9 are sub-bets for phase 2
  bbbWins: number;
  // Snake "win" = match where this player had the fewest 3-putts (ties shared).
  // Keeps direction consistent with the other columns (higher is better).
  snakeWins: number;
  wolfWins: number;
  totalWins: number;
};

export type GroupLeaderboard = {
  rows: LeaderboardRow[];
  completedMatches: number;
  // Which game types appeared in at least one completed match -- the UI
  // hides columns that have no relevant matches yet to keep the table tight.
  hasMain: boolean;
  hasStableford: boolean;
  hasSkins: boolean;
  hasNassau: boolean;
  hasBbb: boolean;
  hasSnake: boolean;
  hasWolf: boolean;
  // Phase 2 extras (computed in the same pass for free)
  headToHead: HeadToHead;
  courseRecords: CourseRecord[];
  champions: GroupChampion[];
  streaks: StreakRow[];
};

// Pairwise head-to-head matrix: for each ordered (A, B), how many times A
// beat B in a main-game result they both played. Ties on a hole don't count
// (neither winner-of-each-other), but ties for the round contribute to neither
// side.
export type HeadToHead = {
  // Sorted list of users that appear in at least one head-to-head
  users: { userId: string; displayName: string; username: string }[];
  // wins[a][b] = number of times a finished lower-net than b
  wins: Record<string, Record<string, number>>;
};

export type CourseRecord = {
  courseName: string;
  bestUserId: string;
  bestDisplayName: string;
  bestUsername: string;
  gross: number;
  net: number;
  matchId: string;
  scheduledAt: Date;
};

export type GroupChampion = {
  kind: "MAIN" | "STABLEFORD" | "SKINS" | "NASSAU" | "BBB" | "SNAKE" | "WOLF";
  label: string;
  // The most recent leader(s) for this game type across the group's matches.
  // Co-winners on ties.
  winners: { userId: string; displayName: string; username: string }[];
  matchId: string;
  courseName: string;
  scheduledAt: Date;
};

export type StreakRow = {
  userId: string;
  displayName: string;
  username: string;
  currentMainStreak: number;
  bestMainStreak: number;
};

// Bump count for every leader (handles ties).
function awardLeaders(
  lb: Leaderboard,
  matchPlayerToUserId: Map<string, string>,
  bump: (userId: string) => void,
) {
  for (const row of lb.rows) {
    if (!row.isLeader) continue;
    const userId = matchPlayerToUserId.get(row.playerId);
    if (userId) bump(userId);
  }
}

export async function computeGroupLeaderboard(
  groupId: string,
): Promise<GroupLeaderboard> {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  });
  const memberUserIds = new Set(members.map((m) => m.userId));

  // Eligible matches: completed AND include at least one group member as
  // a linked player. After fetching we filter for the "two-or-more from
  // this group" rule -- a Big Dogs match with 3 Big Dogs + 1 outsider
  // counts only for Big Dogs; a 2+2 split match counts for both groups.
  // Personal stats (future feature) bypass this filter and count every
  // match a player was in.
  const candidates = await prisma.match.findMany({
    where: {
      status: "COMPLETED",
      players: {
        some: {
          user: { groupMemberships: { some: { groupId } } },
        },
      },
    },
    include: {
      players: { include: { scores: true } },
      sideGames: { include: { events: true } },
    },
  });
  const matchesUnsorted = candidates.filter((m) => {
    const distinctMembersInMatch = new Set<string>();
    for (const p of m.players) {
      if (p.userId && memberUserIds.has(p.userId)) {
        distinctMembersInMatch.add(p.userId);
      }
    }
    return distinctMembersInMatch.size >= 2;
  });
  // Sort chronologically so streak tracking + 'current champion' (most-recent
  // winner overwrites prior) work without a second pass.
  const matches = matchesUnsorted.sort((a, b) => {
    const at = (a.completedAt ?? a.scheduledAt).getTime();
    const bt = (b.completedAt ?? b.scheduledAt).getTime();
    return at - bt;
  });

  const stats = new Map<string, LeaderboardRow>();
  for (const m of members) {
    stats.set(m.userId, {
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarSeed: m.user.avatarSeed,
      avatarVariant: m.user.avatarVariant,
      avatarUrl: m.user.avatarUrl,
      matchesPlayed: 0,
      mainWins: 0,
      stablefordWins: 0,
      skinsWins: 0,
      nassauWins: 0,
      bbbWins: 0,
      snakeWins: 0,
      wolfWins: 0,
      totalWins: 0,
    });
  }

  let hasMain = false;
  let hasStableford = false;
  let hasSkins = false;
  let hasNassau = false;
  let hasBbb = false;
  let hasSnake = false;
  let hasWolf = false;

  // Phase 2 collectors
  const h2hWins = new Map<string, Map<string, number>>();
  for (const m of members) {
    const inner = new Map<string, number>();
    for (const m2 of members) {
      if (m.userId !== m2.userId) inner.set(m2.userId, 0);
    }
    h2hWins.set(m.userId, inner);
  }
  const courseBest = new Map<string, CourseRecord>();
  const championByKind = new Map<GroupChampion["kind"], GroupChampion>();
  const streakState = new Map<
    string,
    { current: number; best: number; lastWon: boolean }
  >();
  for (const m of members) {
    streakState.set(m.userId, { current: 0, best: 0, lastWon: false });
  }

  for (const match of matches) {
    if (match.players.length === 0) continue;
    hasMain = true;

    const pars = parseParData(match.parData, match.holes);
    const scoringMode = match.scoringMode as "NET" | "GROSS" | "CUSTOM";
    const startingHole = match.startingHole ?? 1;
    const matchPlayerToUserId = new Map<string, string>();
    for (const p of match.players) {
      if (p.userId) matchPlayerToUserId.set(p.id, p.userId);
    }

    // Count one "match played" per linked player.
    for (const [, userId] of matchPlayerToUserId) {
      const row = stats.get(userId);
      if (row) row.matchesPlayed++;
    }

    // ---- Main game: lowest net (or gross). Co-winners on ties.
    const nets = match.players.map((p) => {
      const total = p.scores.reduce((s, x) => s + x.strokes, 0);
      const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
      return {
        matchPlayerId: p.id,
        userId: p.userId,
        net: total - allowance,
        hasScores: p.scores.length > 0,
      };
    });
    const scored = nets.filter((n) => n.hasScores);
    const mainWinnerUserIds = new Set<string>();
    if (scored.length > 0) {
      const min = Math.min(...scored.map((n) => n.net));
      for (const n of scored) {
        if (n.net !== min) continue;
        if (!n.userId) continue;
        const row = stats.get(n.userId);
        if (row) row.mainWins++;
        mainWinnerUserIds.add(n.userId);
      }

      // Phase 2: head-to-head -- A beats B when A.net < B.net, both members.
      const memberScored = scored.filter(
        (n) => n.userId && memberUserIds.has(n.userId),
      );
      for (const a of memberScored) {
        for (const b of memberScored) {
          if (a.userId === b.userId) continue;
          if (a.net < b.net) {
            h2hWins.get(a.userId!)?.set(
              b.userId!,
              (h2hWins.get(a.userId!)?.get(b.userId!) ?? 0) + 1,
            );
          }
        }
      }

      // Phase 2: course record -- best gross by a group member at this course.
      for (const p of match.players) {
        if (!p.userId || !memberUserIds.has(p.userId)) continue;
        if (p.scores.length === 0) continue;
        const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
        const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
        const net = gross - allowance;
        const cur = courseBest.get(match.courseName);
        if (!cur || gross < cur.gross) {
          const memberRow = stats.get(p.userId);
          courseBest.set(match.courseName, {
            courseName: match.courseName,
            bestUserId: p.userId,
            bestDisplayName:
              memberRow?.displayName ?? memberRow?.username ?? "Unknown",
            bestUsername: memberRow?.username ?? "",
            gross,
            net,
            matchId: match.id,
            scheduledAt: match.scheduledAt,
          });
        }
      }

      // Phase 2: main-game champion (latest match's winners overwrites).
      // Skip the per-foursome MAIN champion when this match belongs to
      // a tournament -- a tournament-day match's "winner" is the
      // tournament's overall winner, not whoever shot the lowest in
      // their foursome. We post the tournament-level champion in a
      // second pass below, using each completed tournament's leaderboard.
      if (mainWinnerUserIds.size > 0 && !match.tournamentId) {
        const winners = Array.from(mainWinnerUserIds)
          .filter((uid) => memberUserIds.has(uid))
          .map((uid) => {
            const r = stats.get(uid);
            return {
              userId: uid,
              displayName: r?.displayName ?? r?.username ?? "Unknown",
              username: r?.username ?? "",
            };
          });
        if (winners.length > 0) {
          championByKind.set("MAIN", {
            kind: "MAIN",
            label: "Main game",
            winners,
            matchId: match.id,
            courseName: match.courseName,
            scheduledAt: match.scheduledAt,
          });
        }
      }
    }

    // Phase 2: streaks -- per member, every match they were a scored player.
    if (scored.length > 0) {
      for (const p of match.players) {
        if (!p.userId || !memberUserIds.has(p.userId)) continue;
        if (p.scores.length === 0) continue;
        const s = streakState.get(p.userId)!;
        if (mainWinnerUserIds.has(p.userId)) {
          s.current = s.lastWon ? s.current + 1 : 1;
          s.lastWon = true;
          if (s.current > s.best) s.best = s.current;
        } else {
          s.current = 0;
          s.lastWon = false;
        }
      }
    }

    // ---- Side games
    const sgPlayers = match.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      handicap: p.handicap,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    }));
    const seatedPlayers = match.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      displayName: p.displayName,
      handicap: p.handicap,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    }));

    const recordChampion = (
      kind: GroupChampion["kind"],
      label: string,
      lb: Leaderboard,
    ) => {
      const winners = lb.rows
        .filter((r) => r.isLeader)
        .map((r) => matchPlayerToUserId.get(r.playerId))
        .filter((uid): uid is string => !!uid && memberUserIds.has(uid))
        .map((uid) => {
          const row = stats.get(uid);
          return {
            userId: uid,
            displayName: row?.displayName ?? row?.username ?? "Unknown",
            username: row?.username ?? "",
          };
        });
      if (winners.length === 0) return;
      championByKind.set(kind, {
        kind,
        label,
        winners,
        matchId: match.id,
        courseName: match.courseName,
        scheduledAt: match.scheduledAt,
      });
    };

    for (const sg of match.sideGames) {
      const bump = (column: keyof Pick<
        LeaderboardRow,
        | "stablefordWins"
        | "skinsWins"
        | "nassauWins"
        | "bbbWins"
        | "snakeWins"
        | "wolfWins"
      >) => (userId: string) => {
        const row = stats.get(userId);
        if (row) row[column]++;
      };

      if (sg.kind === "STABLEFORD") {
        hasStableford = true;
        const lb = computeStableford(
          sgPlayers,
          pars,
          match.holes,
          scoringMode,
          startingHole,
        );
        awardLeaders(lb, matchPlayerToUserId, bump("stablefordWins"));
        recordChampion("STABLEFORD", "Stableford", lb);
      } else if (sg.kind === "SKINS") {
        hasSkins = true;
        const lb = computeSkins(
          sgPlayers,
          pars,
          match.holes,
          scoringMode,
          startingHole,
        );
        awardLeaders(lb, matchPlayerToUserId, bump("skinsWins"));
        recordChampion("SKINS", "Skins", lb);
      } else if (sg.kind === "NASSAU" && match.holes === 18) {
        hasNassau = true;
        const segments = computeNassau(sgPlayers, pars, match.holes, scoringMode);
        const total = segments.find((s) => s.key === "NASSAU_TOTAL");
        if (total) {
          awardLeaders(total, matchPlayerToUserId, bump("nassauWins"));
          recordChampion("NASSAU", "Nassau · Total", total);
        }
      } else if (sg.kind === "BBB") {
        hasBbb = true;
        const events: BbbEvent[] = sg.events
          .filter((e) => isBbbEventKind(e.kind))
          .map((e) => ({
            hole: e.hole,
            kind: e.kind as BbbEvent["kind"],
            matchPlayerId: e.matchPlayerId ?? null,
          }));
        const lb = computeBbb(sgPlayers, events);
        awardLeaders(lb, matchPlayerToUserId, bump("bbbWins"));
        recordChampion("BBB", "Bingo Bango Bongo", lb);
      } else if (sg.kind === "SNAKE") {
        hasSnake = true;
        const events: SnakeEvent[] = sg.events
          .filter((e) => isSnakeEventKind(e.kind) && e.matchPlayerId)
          .map((e) => ({
            hole: e.hole,
            matchPlayerId: e.matchPlayerId as string,
          }));
        const lb = computeSnake(sgPlayers, events);
        awardLeaders(lb, matchPlayerToUserId, bump("snakeWins"));
        recordChampion("SNAKE", "Snake", lb);
      } else if (sg.kind === "WOLF") {
        hasWolf = true;
        const events: WolfEvent[] = sg.events
          .filter((e) => isWolfEventKind(e.kind))
          .map((e) => ({
            hole: e.hole,
            kind: e.kind as WolfEvent["kind"],
            matchPlayerId: e.matchPlayerId ?? null,
          }));
        const lb = computeWolf(
          seatedPlayers,
          match.holes,
          events,
          undefined,
          startingHole,
        );
        awardLeaders(lb, matchPlayerToUserId, bump("wolfWins"));
        recordChampion("WOLF", "Wolf", lb);
      }
    }
  }

  const rows = Array.from(stats.values());
  for (const r of rows) {
    r.totalWins =
      r.mainWins +
      r.stablefordWins +
      r.skinsWins +
      r.nassauWins +
      r.bbbWins +
      r.snakeWins +
      r.wolfWins;
  }
  rows.sort((a, b) => {
    if (b.mainWins !== a.mainWins) return b.mainWins - a.mainWins;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    return a.username.localeCompare(b.username);
  });

  // Head-to-head: shape the inner Map for JSON-friendly output. Drop users
  // who never appeared in a head-to-head together so the matrix is tight.
  const h2hUserSet = new Set<string>();
  for (const [a, inner] of h2hWins) {
    for (const [b, wins] of inner) {
      if (wins > 0) {
        h2hUserSet.add(a);
        h2hUserSet.add(b);
      }
    }
  }
  const h2hUsers = Array.from(h2hUserSet)
    .map((uid) => {
      const r = stats.get(uid);
      return {
        userId: uid,
        displayName: r?.displayName ?? r?.username ?? "Unknown",
        username: r?.username ?? "",
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const h2hWinsOut: Record<string, Record<string, number>> = {};
  for (const a of h2hUsers) {
    h2hWinsOut[a.userId] = {};
    for (const b of h2hUsers) {
      if (a.userId === b.userId) continue;
      h2hWinsOut[a.userId][b.userId] =
        h2hWins.get(a.userId)?.get(b.userId) ?? 0;
    }
  }

  const courseRecords = Array.from(courseBest.values()).sort((a, b) =>
    a.courseName.localeCompare(b.courseName),
  );

  // Promote the MAIN champion to the tournament-level winner when the
  // most-recent completed activity in the group is a tournament. The
  // per-foursome MAIN winner is skipped above for tournament matches,
  // so without this pass MAIN would point at an older standalone
  // round (or be empty). We compare scheduledAt with the existing
  // MAIN entry's date so a standalone round AFTER a tournament's
  // completion still takes the belt.
  const completedTournaments = await prisma.tournament.findMany({
    where: { groupId, status: "COMPLETED" },
    select: {
      id: true,
      name: true,
      completedAt: true,
      matches: {
        select: { id: true, courseName: true, scheduledAt: true },
        orderBy: { roundNumber: "desc" },
        take: 1,
      },
    },
  });
  for (const t of completedTournaments) {
    if (!t.completedAt) continue;
    const finalRound = t.matches[0];
    const tDate = t.completedAt;
    const existingMain = championByKind.get("MAIN");
    if (existingMain && existingMain.scheduledAt > tDate) continue;
    const lb = await computeTournamentLeaderboard(t.id);
    if (lb.length === 0) continue;
    const topRank = lb[0].rank;
    const winners = lb
      .filter((r) => r.rank === topRank)
      .map((r) => {
        // The tournament leaderboard keys by display name; map back
        // to a Sticks user via the stats Map (built by username) so
        // we can stamp a real userId on the champion entry.
        const match = Array.from(stats.values()).find(
          (s) =>
            s.displayName === r.displayName ||
            s.username === r.displayName.toLowerCase(),
        );
        return {
          userId: match?.userId ?? "",
          displayName: r.displayName,
          username: match?.username ?? "",
        };
      })
      // Only count winners who are members of this group (tournament
      // rosters can include non-members; they don't hold the belt).
      .filter((w) => !w.userId || memberUserIds.has(w.userId));
    if (winners.length === 0) continue;
    championByKind.set("MAIN", {
      kind: "MAIN",
      label: "Main game",
      winners,
      matchId: finalRound?.id ?? t.id,
      courseName: finalRound?.courseName ?? t.name,
      scheduledAt: tDate,
    });
  }

  const champions = Array.from(championByKind.values());

  const streakRows: StreakRow[] = members
    .map((m) => {
      const s = streakState.get(m.userId)!;
      return {
        userId: m.userId,
        displayName: m.user.displayName ?? m.user.username,
        username: m.user.username,
        currentMainStreak: s.current,
        bestMainStreak: s.best,
      };
    })
    .filter((r) => r.bestMainStreak > 0)
    .sort(
      (a, b) =>
        b.currentMainStreak - a.currentMainStreak ||
        b.bestMainStreak - a.bestMainStreak ||
        a.displayName.localeCompare(b.displayName),
    );

  return {
    rows,
    completedMatches: matches.length,
    hasMain,
    hasStableford,
    hasSkins,
    hasNassau,
    hasBbb,
    hasSnake,
    hasWolf,
    headToHead: { users: h2hUsers, wins: h2hWinsOut },
    courseRecords,
    champions,
    streaks: streakRows,
  };
}
