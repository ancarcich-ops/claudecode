// Normalize a Prisma match row into the props the redesigned MatchCard
// expects. Keeps the rendering tree boring -- all the per-hole math,
// dot semantics, ticker fan-out, etc. live here so the React tree stays
// declarative.

import { parseParData } from "./odds";
import { colorForSeat } from "./colors";
import { parseScrambleConfig, teamHandicap as scrambleTeamHandicap } from "./scramble";

// ----- Public types -----

export type DotKind =
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "double"
  | "current"
  | "unplayed";

// One score-grid square. `kind` drives color; `rel` is the diff vs par
// (e.g. -1 for a birdie, +2 for a double), used to render the number
// inside the box for played holes.
export type Dot = { kind: DotKind; rel?: number };

export type Momentum =
  | { kind: "eagle"; hole: number }
  | { kind: "birdie"; hole: number }
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
  // describes the per-hole result; `rel` carries the diff vs par so the
  // dot can render the number (-1, +1, +2, ...). `rel` is omitted for
  // par/current/unplayed where no number should show.
  dots: Dot[];
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
  // True when this player is the current viewer's existing wager pick
  // for this match. Used by the inline "Call" button to switch to a
  // "Picked" badge.
  isMyPick: boolean;
};

// Just the meta the header line ("Hole 12 next · P3") needs. The peek
// panel and its OSM-geometry plumbing were removed in favor of leaning
// on the card body to tell the round's story.
export type NextHole = {
  number: number;
  par: number;
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
  // True when there's only one player. The whole market apparatus
  // (win probabilities, wagers, leader race) is meaningless in that
  // case -- consumer components hide it.
  isSolo: boolean;
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
  // Nullable -- only set on SCRAMBLE matches (0 = Team A, 1 = Team B).
  team?: number | null;
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
  // "INDIVIDUAL" (default) or "SCRAMBLE". For SCRAMBLE the
  // builder collapses N player rows into 2 team rows.
  format?: string;
  scrambleConfig?: string | null;
  players: RawPlayer[];
  _count: { wagers: number };
};

export function buildMatchCardData(
  m: RawMatch,
  // Win probabilities keyed by id. For INDIVIDUAL matches this is
  // matchPlayerId; for SCRAMBLE the caller can pass either
  // matchPlayerId (we'll dedup by team) or the synthetic "team-0" /
  // "team-1" keys -- the card loop reads from whichever is present.
  probabilities: Record<string, number>,
  // matchPlayerId the current viewer has wagered on for this match,
  // if any. Drives the per-player "Picked" badge.
  myPickPlayerId?: string | null,
): MatchCardData {
  const totalHoles = m.holes;
  const startingHole = m.startingHole ?? 1;
  const pars = parseParData(m.parData, totalHoles);

  // For SCRAMBLE matches: collapse the N player rows into 2 synthetic
  // "team players" so the existing per-player card loop produces 2
  // team cards instead of N individual cards. Each synthetic team
  // carries the captain's matchPlayerId (so the probabilities lookup,
  // myPick highlight, and downstream rank/sort by id all keep
  // working), the captain's scores (which IS the team's scores in
  // scramble), the team's handicap (per scrambleConfig), and a
  // display name labelling the team + roster.
  const isScramble = m.format === "SCRAMBLE";
  let cardPlayers: RawPlayer[];
  if (isScramble) {
    const teams: Record<0 | 1, RawPlayer[]> = { 0: [], 1: [] };
    for (const p of m.players) {
      if (p.team === 0) teams[0].push(p);
      else if (p.team === 1) teams[1].push(p);
    }
    teams[0].sort((a, b) => a.seat - b.seat);
    teams[1].sort((a, b) => a.seat - b.seat);
    const config = parseScrambleConfig(m.scrambleConfig ?? null);
    cardPlayers = ([0, 1] as const)
      .map((t) => {
        const roster = teams[t];
        if (roster.length === 0) return null;
        const captain = roster[0];
        // scrambleTeamHandicap expects {handicap, seat, team} per
        // player; build a minimal shape from the roster.
        const teamHcp = scrambleTeamHandicap(
          roster.map((r) => ({
            handicap: r.handicap,
            seat: r.seat,
            team: t,
            id: r.id,
            displayName: r.displayName,
          })),
          config.handicapMode,
          config.customAllowance?.[t],
        );
        const name =
          (t === 0
            ? config.teamNames?.[0] ?? "Team A"
            : config.teamNames?.[1] ?? "Team B") +
          " — " +
          roster.map((r) => r.displayName).join(" & ");
        return {
          ...captain,
          displayName: name,
          handicap: teamHcp,
          _count: {
            wagers: roster.reduce(
              (sum, r) => sum + (r._count?.wagers ?? 0),
              0,
            ),
          },
        };
      })
      .filter((x): x is RawPlayer => x != null);
  } else {
    cardPlayers = m.players;
  }

  // Group max thru = first hole nobody has scored yet. For LIVE cards
  // this is the "current" hole.
  let maxLoggedHole = 0;
  for (const p of cardPlayers) {
    for (const s of p.scores) {
      if (s.hole > maxLoggedHole) maxLoggedHole = s.hole;
    }
  }
  const lastHole = startingHole + totalHoles - 1;
  const currentHole = Math.min(maxLoggedHole + 1, lastHole);

  // Final standings (settled). Rank by the match's scoring mode: GROSS
  // ranks by raw strokes; NET/CUSTOM subtract the player's handicap (or
  // strokes-given column). Earlier this always subtracted handicap,
  // which gave the wrong winner on a gross match.
  const useNet = m.scoringMode !== "GROSS";
  const playerScores = cardPlayers.map((p) => {
    const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
    return {
      id: p.id,
      score: useNet ? gross - p.handicap : gross,
      gross,
    };
  });
  const rankedIds = [...playerScores]
    .sort((a, b) => a.score - b.score)
    .map((x) => x.id);
  const rankFor = (id: string) =>
    m.status === "COMPLETED" ? rankedIds.indexOf(id) + 1 : 0;

  const players: PlayerCard[] = cardPlayers.map((p) => {
    const byHole = new Map(p.scores.map((s) => [s.hole, s.strokes]));
    const dots: Dot[] = [];
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
        dots.push({ kind: dotKindFor(diff), rel: diff });
        playedDiffs.push({ hole, diff });
      } else if (
        hole === currentHole &&
        m.status === "IN_PROGRESS" &&
        maxLoggedHole > 0
      ) {
        dots.push({ kind: "current" });
      } else {
        dots.push({ kind: "unplayed" });
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
      isMyPick: !!myPickPlayerId && myPickPlayerId === p.id,
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
    // When the round has reached its final hole, there's no "next" --
    // currentHole gets clamped to lastHole by Math.min above, which
    // otherwise leaves the LIVE card cheerfully announcing the final
    // hole as still upcoming.
    nextHole:
      maxLoggedHole >= lastHole
        ? null
        : buildNextHole(currentHole, pars, startingHole, m.status),
    isSolo: players.length === 1,
    tickerItems: buildTickerItems(
      players,
      m.status,
      m._count.wagers,
      players.length === 1,
    ),
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
  return { number: hole, par: pars[idx] ?? 4 };
}

// Compose a small list of marquee items for the LIVE header ticker.
// Stays deterministic from match state so the marquee doesn't shuffle
// every render. TODO realtime: replace with a server-side derived event
// stream once we have a push channel.
function buildTickerItems(
  players: PlayerCard[],
  status: string,
  totalWagers: number,
  isSolo: boolean,
): string[] {
  const items: string[] = [];
  // Top three by probability so the marquee leads with the line. Skip
  // for solo rounds -- one player is always 100% to "win," it's noise.
  const sorted = [...players].sort(
    (a, b) => b.winProbability - a.winProbability,
  );
  if (!isSolo) {
    for (const p of sorted.slice(0, 3)) {
      const pct = Math.round(p.winProbability * 100);
      items.push(`${p.name.toUpperCase()} ${pct}%`);
    }
  }
  if (status === "IN_PROGRESS") {
    const leader = sorted[0];
    if (leader && leader.holesPlayed > 0) {
      const sign = leader.netToPar > 0 ? "+" : "";
      const npar = leader.netToPar === 0 ? "E" : `${sign}${leader.netToPar}`;
      // "Leader" implies a race; for solo just label it "score."
      const label = isSolo ? "SCORE" : "LEADER";
      items.push(`${label} ${npar} THRU ${leader.holesPlayed}`);
    }
  }
  if (totalWagers > 0) {
    items.push(`${totalWagers} WAGER${totalWagers === 1 ? "" : "S"}`);
  }
  if (!isSolo && status === "UPCOMING") {
    items.push(`MARKET OPEN`);
  }
  return items;
}

// Reads the per-hole diffs (in chronological play order) and decides
// whether the player gets a momentum badge. Priority:
//   eagle  (most recent hole was an eagle)
//   hot    (>=3 birdies in the round so far)
//   birdie (most recent hole was a birdie -- when not also hot)
//   cold   (cumulative >=+4 strokes over par across the last 3 holes)
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
  const totalBirdiesOrBetter = diffs.filter((d) => d.diff <= -1).length;
  if (totalBirdiesOrBetter >= 3) {
    return {
      kind: "hot",
      birdies: totalBirdiesOrBetter,
      lastN: diffs.length,
    };
  }
  if (last.diff === -1) {
    return { kind: "birdie", hole: last.hole };
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
