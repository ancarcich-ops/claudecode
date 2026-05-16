// Normalize a Prisma match row into the props the redesigned MatchCard
// expects. Keeps the rendering tree boring -- all the per-hole math,
// dot semantics, ticker fan-out, etc. live here so the React tree stays
// declarative.

import { parseParData } from "./odds";
import { colorForSeat } from "./colors";
import { buildHoleShapePath, type LatLng } from "./holeShape";

// ----- Public types -----

export type DotKind =
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "double"
  | "current"
  | "unplayed";

export type Momentum =
  | { kind: "eagle"; hole: number }
  | { kind: "hot"; birdies: number; lastN: number }
  | { kind: "cold"; over: number; lastN: number };

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
  // Optional badge surfaced next to the thru chip; null when nothing
  // exceptional has happened recently. eagle > hot > cold > null.
  momentum: Momentum | null;
  // Cumulative net-to-par at each scored hole (oldest -> newest).
  // Length == holesPlayed. Used to draw the small inline sparkline.
  cumulativeNet: number[];
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

// Optional course geometry for a single hole. Comes from CourseHole
// rows that the OSM seeder populates. When provided for the upcoming
// "next hole", PeekHole renders a real sketched shape instead of the
// generic placeholder curve.
export type HoleGeoLite = {
  tee: LatLng | null;
  green: LatLng | null;
  fairwayPolygon: LatLng[] | null;
  yardageYds: number | null;
  strokeIndex: number | null;
};

export function buildMatchCardData(
  m: RawMatch,
  // Win probabilities keyed by matchPlayerId.
  probabilities: Record<string, number>,
  // Optional: geometry + meta for the match's *next* hole. Passing it
  // upgrades the peek panel from a placeholder curve to a real sketch.
  nextHoleGeo?: HoleGeoLite | null,
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
    // Chronological order of holes the player actually scored, with the
    // diff vs par. Used both for the sparkline cumulative array and the
    // momentum read.
    const playedDiffs: { hole: number; diff: number }[] = [];
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
        playedDiffs.push({ hole, diff });
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
    // Cumulative running net for the sparkline -- oldest scored hole on
    // the left, latest on the right.
    const cumulativeNet: number[] = [];
    {
      let running = 0;
      for (const d of playedDiffs) {
        running += d.diff;
        cumulativeNet.push(running);
      }
    }
    const momentum = momentumFor(playedDiffs);
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
      momentum,
      cumulativeNet,
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
      nextHoleGeo ?? null,
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
  geo: HoleGeoLite | null,
): NextHole | null {
  if (status !== "IN_PROGRESS" && status !== "UPCOMING") return null;
  const idx = hole - startingHole;
  if (idx < 0 || idx >= pars.length) return null;
  const shapePath = geo
    ? buildHoleShapePath(geo.tee, geo.green, geo.fairwayPolygon)
    : null;
  return {
    number: hole,
    par: pars[idx] ?? 4,
    yardageYds: geo?.yardageYds ?? null,
    strokeIndex: geo?.strokeIndex ?? null,
    shapePath,
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

// Reads the per-hole diffs (in chronological play order) and decides
// whether the player gets a momentum badge. Spec priority:
//   eagle (most recent hole was an eagle)  >
//   hot   (>=3 birdies in last 5 OR an eagle anywhere in last 5)  >
//   cold  (cumulative >=+4 strokes over par in last 3)  >
//   null
// Only one badge per player. The chip uses the returned shape to pick
// its label / icon / color.
function momentumFor(
  diffs: { hole: number; diff: number }[],
): Momentum | null {
  if (diffs.length === 0) return null;
  const last = diffs[diffs.length - 1];
  if (last.diff <= -2) {
    return { kind: "eagle", hole: last.hole };
  }
  const last5 = diffs.slice(-5);
  if (last5.some((d) => d.diff <= -2)) {
    return { kind: "hot", birdies: last5.filter((d) => d.diff <= -1).length, lastN: last5.length };
  }
  const birdies = last5.filter((d) => d.diff === -1).length;
  if (birdies >= 3) {
    return { kind: "hot", birdies, lastN: last5.length };
  }
  const last3 = diffs.slice(-3);
  if (last3.length === 3) {
    const overSum = last3.reduce((s, d) => s + d.diff, 0);
    if (overSum >= 4) {
      return { kind: "cold", over: overSum, lastN: last3.length };
    }
  }
  return null;
}
