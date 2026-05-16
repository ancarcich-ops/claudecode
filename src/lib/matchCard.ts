// Normalize a Prisma match row into the props the redesigned MatchCard
// expects. Keeps the rendering tree boring -- all the per-hole math,
// dot semantics, ticker fan-out, etc. live here so the React tree stays
// declarative.

import { parseParData } from "./odds";
import { colorForSeat } from "./colors";

// ----- Public types -----

export type DotKind =
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "double"
  | "current"
  | "unplayed";

export type PlayerCard = {
  id: string;
  name: string;
  username: string | null;
  seat: number;
  color: string; // hex from colorForSeat
  handicap: number;
  avatar: {
    seed: string | null;
    variant: string | null;
    url: string | null;
  };
  winProbability: number; // 0..1
  // The strokes-over-par across logged holes. Negative = under.
  netToPar: number;
  holesPlayed: number;
  // Length = totalHoles. Indexed from `startingHole`. Each entry
  // describes the per-hole result; null is "not yet played".
  dots: DotKind[];
  // For SETTLED: per-nine net (only meaningful for 18-hole rounds).
  outNet: number;
  inNet: number;
  // 1-based rank used by SETTLED rows. 0 means "still in progress".
  rank: number;
};

export type NextHole = {
  number: number;
  par: number;
  yardageYds: number | null;
  strokeIndex: number | null;
  // SVG path data for the hole sketch, viewBox 0 0 100 18. Null when
  // we don't have OSM geometry yet.
  shapePath: string | null;
};

export type MatchCardData = {
  id: string;
  courseName: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  totalHoles: number;
  startingHole: number; // 1 (full / front 9) or 10 (back 9)
  scheduledAt: Date;
  // Total wager count for the market chip.
  wagerCount: number;
  // Players in seat order.
  players: PlayerCard[];
  nextHole: NextHole | null;
  // Marquee items for the LIVE header ticker.
  tickerItems: string[];
};

// ----- Public API -----

type Score = { hole: number; strokes: number };
type RawPlayer = {
  id: string;
  displayName: string;
  seat: number;
  handicap: number;
  user: {
    username: string;
    avatarSeed: string | null;
    avatarVariant: string | null;
    avatarUrl: string | null;
  } | null;
  scores: Score[];
  _count: { wagers: number };
};

type RawMatch = {
  id: string;
  courseName: string;
  scheduledAt: Date;
  holes: number;
  startingHole: number;
  status: string;
  parData: string | null;
  scoringMode: string;
  players: RawPlayer[];
  _count: { wagers: number };
};

export function buildMatchCardData(
  m: RawMatch,
  // Win probabilities keyed by matchPlayerId.
  probabilities: Record<string, number>,
): MatchCardData {
  const totalHoles = m.holes;
  const startingHole = m.startingHole ?? 1;
  const pars = parseParData(m.parData, totalHoles);

  // Group max thru = first hole nobody has scored yet. For LIVE cards
  // this is the "current" hole.
  let maxLoggedHole = 0;
  for (const p of m.players) {
    for (const s of p.scores) {
      if (s.hole > maxLoggedHole) maxLoggedHole = s.hole;
    }
  }
  const lastHole = startingHole + totalHoles - 1;
  const currentHole = Math.min(maxLoggedHole + 1, lastHole);

  // Final standings (settled) -- rank by net.
  const playerNets = m.players.map((p) => {
    const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
    return { id: p.id, net: gross - p.handicap, gross };
  });
  const rankedIds = [...playerNets].sort((a, b) => a.net - b.net).map((x) => x.id);
  const rankFor = (id: string) =>
    m.status === "COMPLETED" ? rankedIds.indexOf(id) + 1 : 0;

  const players: PlayerCard[] = m.players.map((p) => {
    const byHole = new Map(p.scores.map((s) => [s.hole, s.strokes]));
    const dots: DotKind[] = [];
    let outNet = 0;
    let inNet = 0;
    let netToPar = 0;
    let holesPlayed = 0;
    for (let i = 0; i < totalHoles; i++) {
      const hole = startingHole + i;
      const par = pars[i] ?? 4;
      const strokes = byHole.get(hole);
      if (typeof strokes === "number") {
        const diff = strokes - par;
        netToPar += diff;
        if (hole <= 9) outNet += diff;
        else inNet += diff;
        holesPlayed++;
        dots.push(dotKindFor(diff));
      } else if (
        hole === currentHole &&
        m.status === "IN_PROGRESS" &&
        maxLoggedHole > 0
      ) {
        dots.push("current");
      } else {
        dots.push("unplayed");
      }
    }
    return {
      id: p.id,
      name: p.displayName,
      username: p.user?.username ?? null,
      seat: p.seat,
      color: colorForSeat(p.seat),
      handicap: p.handicap,
      avatar: {
        seed: p.user?.avatarSeed ?? p.user?.username ?? p.displayName,
        variant: p.user?.avatarVariant ?? null,
        url: p.user?.avatarUrl ?? null,
      },
      winProbability: probabilities[p.id] ?? 0,
      netToPar,
      holesPlayed,
      dots,
      outNet,
      inNet,
      rank: rankFor(p.id),
    };
  });

  return {
    id: m.id,
    courseName: m.courseName,
    status: statusOf(m.status),
    totalHoles,
    startingHole,
    scheduledAt: m.scheduledAt,
    wagerCount: m._count.wagers,
    players,
    nextHole: buildNextHole(
      currentHole,
      pars,
      startingHole,
      m.status,
    ),
    tickerItems: buildTickerItems(players, m.status, m._count.wagers),
  };
}

// ----- Helpers -----

function statusOf(s: string): MatchCardData["status"] {
  if (s === "IN_PROGRESS") return "IN_PROGRESS";
  if (s === "COMPLETED") return "COMPLETED";
  return "UPCOMING";
}

function dotKindFor(diff: number): DotKind {
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double";
}

function buildNextHole(
  hole: number,
  pars: number[],
  startingHole: number,
  status: string,
): NextHole | null {
  if (status !== "IN_PROGRESS" && status !== "UPCOMING") return null;
  const idx = hole - startingHole;
  if (idx < 0 || idx >= pars.length) return null;
  return {
    number: hole,
    par: pars[idx] ?? 4,
    // TODO: pull yardage + stroke index from CourseHole when available.
    yardageYds: null,
    strokeIndex: null,
    shapePath: null,
  };
}

// Compose a small list of marquee items for the LIVE header ticker.
// Stays deterministic from match state so the marquee doesn't shuffle
// every render. TODO realtime: replace with a server-side derived event
// stream once we have a push channel.
function buildTickerItems(
  players: PlayerCard[],
  status: string,
  totalWagers: number,
): string[] {
  const items: string[] = [];
  // Top three by probability so the marquee leads with the line.
  const sorted = [...players].sort(
    (a, b) => b.winProbability - a.winProbability,
  );
  for (const p of sorted.slice(0, 3)) {
    const pct = Math.round(p.winProbability * 100);
    items.push(`${p.name.toUpperCase()} ${pct}%`);
  }
  if (status === "IN_PROGRESS") {
    const leader = sorted[0];
    if (leader && leader.holesPlayed > 0) {
      const sign = leader.netToPar > 0 ? "+" : "";
      const npar = leader.netToPar === 0 ? "E" : `${sign}${leader.netToPar}`;
      items.push(`LEADER ${npar} THRU ${leader.holesPlayed}`);
    }
  }
  if (totalWagers > 0) {
    items.push(`${totalWagers} WAGER${totalWagers === 1 ? "" : "S"}`);
  }
  if (status === "UPCOMING") {
    items.push(`MARKET OPEN`);
  }
  return items;
}
