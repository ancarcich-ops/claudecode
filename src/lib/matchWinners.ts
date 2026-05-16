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

// Persisted shape of per-match winners. Each key is an array of userIds
// (handles ties). Stored as JSON on Match.winnerSummary at completion time
// so the group leaderboard doesn't recompute the side-game engines for
// every historical match on every render.
export type WinnerSummary = {
  main?: string[];
  stableford?: string[];
  skins?: string[];
  nassau?: string[];
  bbb?: string[];
  snake?: string[];
  wolf?: string[];
};

export function parseWinnerSummary(s: string | null | undefined): WinnerSummary {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as WinnerSummary) : {};
  } catch {
    return {};
  }
}

export async function computeAndPersistMatchWinners(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { include: { scores: true } },
      sideGames: { include: { events: true } },
    },
  });
  if (!match) return;
  if (match.status !== "COMPLETED") {
    // Clear stored winners for non-completed states so we never serve stale data.
    if (match.winnerSummary) {
      await prisma.match.update({
        where: { id: matchId },
        data: { winnerSummary: null },
      });
    }
    return;
  }

  const pars = parseParData(match.parData, match.holes);
  const scoringMode = match.scoringMode as "NET" | "GROSS" | "CUSTOM";
  const startingHole = match.startingHole ?? 1;
  const matchPlayerToUserId = new Map<string, string>();
  for (const p of match.players) {
    if (p.userId) matchPlayerToUserId.set(p.id, p.userId);
  }

  const winnersFromLeaderboard = (lb: {
    rows: { playerId: string; isLeader: boolean }[];
  }): string[] => {
    const out: string[] = [];
    for (const r of lb.rows) {
      if (!r.isLeader) continue;
      const uid = matchPlayerToUserId.get(r.playerId);
      if (uid) out.push(uid);
    }
    return out;
  };

  const summary: WinnerSummary = {};

  // Main game: lowest net (or gross). Co-winners on ties.
  const nets = match.players.map((p) => {
    const total = p.scores.reduce((s, x) => s + x.strokes, 0);
    const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
    return {
      userId: p.userId,
      net: total - allowance,
      hasScores: p.scores.length > 0,
    };
  });
  const scored = nets.filter((n) => n.hasScores);
  if (scored.length > 0) {
    const min = Math.min(...scored.map((n) => n.net));
    summary.main = scored
      .filter((n) => n.net === min && !!n.userId)
      .map((n) => n.userId as string);
  }

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

  for (const sg of match.sideGames) {
    if (sg.kind === "STABLEFORD") {
      summary.stableford = winnersFromLeaderboard(
        computeStableford(sgPlayers, pars, match.holes, scoringMode, startingHole),
      );
    } else if (sg.kind === "SKINS") {
      summary.skins = winnersFromLeaderboard(
        computeSkins(sgPlayers, pars, match.holes, scoringMode, startingHole),
      );
    } else if (sg.kind === "NASSAU" && match.holes === 18) {
      const segs = computeNassau(sgPlayers, pars, match.holes, scoringMode);
      const total = segs.find((s) => s.key === "NASSAU_TOTAL");
      if (total) summary.nassau = winnersFromLeaderboard(total);
    } else if (sg.kind === "BBB") {
      const events: BbbEvent[] = sg.events
        .filter((e) => isBbbEventKind(e.kind))
        .map((e) => ({
          hole: e.hole,
          kind: e.kind as BbbEvent["kind"],
          matchPlayerId: e.matchPlayerId ?? null,
        }));
      summary.bbb = winnersFromLeaderboard(computeBbb(sgPlayers, events));
    } else if (sg.kind === "SNAKE") {
      const events: SnakeEvent[] = sg.events
        .filter((e) => isSnakeEventKind(e.kind) && e.matchPlayerId)
        .map((e) => ({
          hole: e.hole,
          matchPlayerId: e.matchPlayerId as string,
        }));
      summary.snake = winnersFromLeaderboard(computeSnake(sgPlayers, events));
    } else if (sg.kind === "WOLF") {
      const events: WolfEvent[] = sg.events
        .filter((e) => isWolfEventKind(e.kind))
        .map((e) => ({
          hole: e.hole,
          kind: e.kind as WolfEvent["kind"],
          matchPlayerId: e.matchPlayerId ?? null,
        }));
      const config = parseWolfConfig(sg.config);
      summary.wolf = winnersFromLeaderboard(
        computeWolf(seatedPlayers, match.holes, events, config, startingHole),
      );
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { winnerSummary: JSON.stringify(summary) },
  });
}
