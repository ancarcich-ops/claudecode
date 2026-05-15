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
  const matches = candidates.filter((m) => {
    const distinctMembersInMatch = new Set<string>();
    for (const p of m.players) {
      if (p.userId && memberUserIds.has(p.userId)) {
        distinctMembersInMatch.add(p.userId);
      }
    }
    return distinctMembersInMatch.size >= 2;
  });

  const stats = new Map<string, LeaderboardRow>();
  for (const m of members) {
    stats.set(m.userId, {
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
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

  for (const match of matches) {
    if (match.players.length === 0) continue;
    hasMain = true;

    const pars = parseParData(match.parData, match.holes);
    const scoringMode = match.scoringMode as "NET" | "GROSS" | "CUSTOM";
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
    if (scored.length > 0) {
      const min = Math.min(...scored.map((n) => n.net));
      for (const n of scored) {
        if (n.net !== min) continue;
        if (!n.userId) continue;
        const row = stats.get(n.userId);
        if (row) row.mainWins++;
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
        const lb = computeStableford(sgPlayers, pars, match.holes, scoringMode);
        awardLeaders(lb, matchPlayerToUserId, bump("stablefordWins"));
      } else if (sg.kind === "SKINS") {
        hasSkins = true;
        const lb = computeSkins(sgPlayers, pars, match.holes, scoringMode);
        awardLeaders(lb, matchPlayerToUserId, bump("skinsWins"));
      } else if (sg.kind === "NASSAU" && match.holes === 18) {
        hasNassau = true;
        // Use the Total segment as the headline "Nassau win". F9 and B9
        // are independent sub-bets we can surface separately in phase 2.
        const segments = computeNassau(sgPlayers, pars, match.holes, scoringMode);
        const total = segments.find((s) => s.key === "NASSAU_TOTAL");
        if (total) awardLeaders(total, matchPlayerToUserId, bump("nassauWins"));
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
      } else if (sg.kind === "WOLF") {
        hasWolf = true;
        const events: WolfEvent[] = sg.events
          .filter((e) => isWolfEventKind(e.kind))
          .map((e) => ({
            hole: e.hole,
            kind: e.kind as WolfEvent["kind"],
            matchPlayerId: e.matchPlayerId ?? null,
          }));
        const lb = computeWolf(seatedPlayers, match.holes, events);
        awardLeaders(lb, matchPlayerToUserId, bump("wolfWins"));
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
  };
}
