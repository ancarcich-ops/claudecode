// Side-game compute engine. Pure functions: each `compute*` takes already-
// loaded scores + pars + handicaps and returns one or more leaderboards.
//
// Phase 1 supports games derivable from per-hole strokes alone:
//   - Stableford (WHS standard points)
//   - Skins (with carryover)
//   - Nassau (front 9 / back 9 / total, 18-hole rounds only)
//
// Wolf, Bingo Bango Bongo, and Snake need per-hole event data we don't
// capture yet (partner rotation, on-green / closest-pin events, 3-putts).
// Those land in phase 2 once we add a per-hole event recorder.

export type SideGameKind =
  | "STABLEFORD"
  | "SKINS"
  | "NASSAU"
  | "BBB"
  | "SNAKE";

// Per-hole event kinds. Stored in SideGameEvent.kind for BBB rows.
export const BBB_EVENT_KINDS = ["BINGO", "BANGO", "BONGO"] as const;
export type BbbEventKind = (typeof BBB_EVENT_KINDS)[number];

export function isBbbEventKind(s: string): s is BbbEventKind {
  return (BBB_EVENT_KINDS as readonly string[]).includes(s);
}

export const SNAKE_EVENT_KINDS = ["THREE_PUTT"] as const;
export type SnakeEventKind = (typeof SNAKE_EVENT_KINDS)[number];

export function isSnakeEventKind(s: string): s is SnakeEventKind {
  return (SNAKE_EVENT_KINDS as readonly string[]).includes(s);
}

export const ALL_SIDE_GAMES: {
  kind: SideGameKind;
  label: string;
  blurb: string;
  // For 9-hole matches we hide Nassau (it's defined by front/back 9).
  requires18?: boolean;
}[] = [
  {
    kind: "STABLEFORD",
    label: "Stableford",
    blurb: "WHS points per hole. Higher is better.",
  },
  {
    kind: "SKINS",
    label: "Skins",
    blurb: "Low net wins the hole; ties carry over.",
  },
  {
    kind: "NASSAU",
    label: "Nassau",
    blurb: "Three bets in one: front 9, back 9, and total.",
    requires18: true,
  },
  {
    kind: "BBB",
    label: "Bingo Bango Bongo",
    blurb:
      "Three per-hole points: first on the green, closest once on, first in the hole.",
  },
  {
    kind: "SNAKE",
    label: "Snake",
    blurb:
      "Every 3-putt passes the snake. Whoever holds it at the end loses.",
  },
];

// Future kinds: surfaced in the UI as 'coming soon' so users can see the
// roadmap without us implementing them yet.
export const COMING_SOON_SIDE_GAMES = [
  { kind: "WOLF", label: "Wolf", blurb: "Rotating partners, weekly format." },
];

export type LiveScorePlayer = {
  id: string;
  displayName: string;
  handicap: number;
  scoresByHole: Record<number, number>;
};

export type LeaderboardRow = {
  playerId: string;
  player: string;
  value: string;
  numeric: number;
  isLeader: boolean;
};

export type Leaderboard = {
  key: string; // unique within a match (e.g. "STABLEFORD", "NASSAU_FRONT9")
  kind: SideGameKind;
  title: string;
  subtitle?: string;
  rows: LeaderboardRow[];
};

// Handicap allocation per hole. Without a per-hole stroke-index table, we
// distribute evenly by hole number: floor(hcp / holes) on each, +1 on the
// first (hcp % holes) holes. Faithful to total strokes given even if not
// to the real stroke-index priority.
function strokesGiven(
  handicap: number,
  holeIndex0: number, // 0-based
  totalHoles: number,
): number {
  if (handicap <= 0) return 0;
  const base = Math.floor(handicap / totalHoles);
  const extra = handicap - base * totalHoles;
  return base + (holeIndex0 < extra ? 1 : 0);
}

type ScoringMode = "NET" | "GROSS" | "CUSTOM";

function netStrokesForHole(
  gross: number,
  handicap: number,
  holeIndex0: number,
  totalHoles: number,
  scoringMode: ScoringMode,
): number {
  if (scoringMode === "GROSS") return gross;
  return gross - strokesGiven(handicap, holeIndex0, totalHoles);
}

function stablefordPointsFromNet(net: number, par: number): number {
  // WHS standard, capped at 0 for double-or-worse.
  const diff = net - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function rankRows(
  rows: Omit<LeaderboardRow, "isLeader">[],
  higherIsBetter: boolean,
): LeaderboardRow[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) =>
    higherIsBetter ? b.numeric - a.numeric : a.numeric - b.numeric,
  );
  const top = sorted[0].numeric;
  return sorted.map((r) => ({ ...r, isLeader: r.numeric === top }));
}

// --- Stableford ---
export function computeStableford(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): Leaderboard {
  const rows = players.map((p) => {
    let points = 0;
    let counted = 0;
    for (let i = 0; i < holes; i++) {
      const gross = p.scoresByHole[i + 1];
      if (typeof gross !== "number") continue;
      const par = pars[i] ?? 4;
      const net = netStrokesForHole(gross, p.handicap, i, holes, scoringMode);
      points += stablefordPointsFromNet(net, par);
      counted++;
    }
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: points,
      value: counted === 0 ? "—" : `${points} pt${points === 1 ? "" : "s"}`,
    };
  });
  return {
    key: "STABLEFORD",
    kind: "STABLEFORD",
    title: "Stableford",
    subtitle:
      scoringMode === "GROSS" ? "Gross points" : "Net points (WHS scale)",
    rows: rankRows(rows, true),
  };
}

// --- Skins ---
export function computeSkins(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): Leaderboard {
  const skinsByPlayer = new Map<string, number>();
  for (const p of players) skinsByPlayer.set(p.id, 0);

  let carryover = 1;
  let openHole = 0;

  for (let i = 0; i < holes; i++) {
    // Only resolve holes where every player has a score.
    if (players.some((p) => typeof p.scoresByHole[i + 1] !== "number")) {
      break;
    }
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[i + 1] as number,
        p.handicap,
        i,
        holes,
        scoringMode,
      ),
    }));
    const low = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === low);
    if (winners.length === 1) {
      const id = winners[0].id;
      skinsByPlayer.set(id, (skinsByPlayer.get(id) ?? 0) + carryover);
      carryover = 1;
    } else {
      carryover += 1;
    }
    openHole = i + 1;
  }

  const rows = players.map((p) => {
    const count = skinsByPlayer.get(p.id) ?? 0;
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: count,
      value: `${count} skin${count === 1 ? "" : "s"}`,
    };
  });
  const subtitle =
    openHole === 0
      ? "No holes scored yet"
      : carryover > 1
        ? `Thru ${openHole} · ${carryover - 1} carrying`
        : `Thru ${openHole}`;
  return {
    key: "SKINS",
    kind: "SKINS",
    title: "Skins",
    subtitle,
    rows: rankRows(rows, true),
  };
}

// --- Nassau (18-hole only) ---
function nassauSegment(
  players: LiveScorePlayer[],
  pars: number[],
  scoringMode: ScoringMode,
  startHole1: number, // 1-based, inclusive
  endHole1: number, // 1-based, inclusive
  totalHoles: number,
  key: string,
  title: string,
): Leaderboard {
  const rows = players.map((p) => {
    let net = 0;
    let counted = 0;
    for (let h = startHole1; h <= endHole1; h++) {
      const gross = p.scoresByHole[h];
      if (typeof gross !== "number") continue;
      net += netStrokesForHole(
        gross,
        p.handicap,
        h - 1,
        totalHoles,
        scoringMode,
      );
      counted++;
    }
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: counted === 0 ? Number.POSITIVE_INFINITY : net,
      value: counted === 0 ? "—" : `${net} (thru ${counted})`,
    };
  });
  return {
    key,
    kind: "NASSAU",
    title,
    rows: rankRows(rows, false),
  };
}

export function computeNassau(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): Leaderboard[] {
  if (holes !== 18) return [];
  return [
    nassauSegment(
      players,
      pars,
      scoringMode,
      1,
      9,
      holes,
      "NASSAU_FRONT9",
      "Front 9",
    ),
    nassauSegment(
      players,
      pars,
      scoringMode,
      10,
      18,
      holes,
      "NASSAU_BACK9",
      "Back 9",
    ),
    nassauSegment(
      players,
      pars,
      scoringMode,
      1,
      18,
      holes,
      "NASSAU_TOTAL",
      "Total",
    ),
  ];
}

// ---- Bingo Bango Bongo --------------------------------------------------
// Source data is a list of per-hole event awards. Each event row points to
// one player who scored the event on that hole. Scoring is +1 per event
// awarded; no handicap or par math involved.

export type BbbEvent = {
  hole: number;
  kind: BbbEventKind;
  matchPlayerId: string | null;
};

export function computeBbb(
  players: LiveScorePlayer[],
  events: BbbEvent[],
): Leaderboard {
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (const e of events) {
    if (e.matchPlayerId && e.matchPlayerId in counts) {
      counts[e.matchPlayerId] += 1;
    }
  }
  const rows = players.map((p) => ({
    playerId: p.id,
    player: p.displayName,
    numeric: counts[p.id] ?? 0,
    value: `${counts[p.id] ?? 0} pt${(counts[p.id] ?? 0) === 1 ? "" : "s"}`,
  }));
  const totalAwarded = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    key: "BBB",
    kind: "BBB",
    title: "Bingo Bango Bongo",
    subtitle: totalAwarded === 0 ? "No events awarded yet" : undefined,
    rows: rankRows(rows, true),
  };
}

export function runningBbb(
  players: LiveScorePlayer[],
  holes: number,
  events: BbbEvent[],
): RunningSeries {
  const through = Math.min(
    holes,
    events.length === 0
      ? 0
      : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = 1; h <= through; h++) {
    for (const e of events) {
      if (e.hole === h && e.matchPlayerId && e.matchPlayerId in totals) {
        totals[e.matchPlayerId] += 1;
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

// ---- Snake --------------------------------------------------------------
// Source data: a row per (hole, playerId) for each 3-putt. Multiple players
// can 3-putt on the same hole. Total 3-putts = base leaderboard signal
// (fewer is better). The "current snake holder" is whoever was tagged on
// the highest-numbered hole that has any 3-putt -- if multiple players
// 3-putted on that hole, all of them currently share the snake.

export type SnakeEvent = {
  hole: number;
  matchPlayerId: string;
};

function snakeHolders(events: SnakeEvent[]): Set<string> {
  if (events.length === 0) return new Set();
  const lastHole = Math.max(...events.map((e) => e.hole));
  return new Set(
    events.filter((e) => e.hole === lastHole).map((e) => e.matchPlayerId),
  );
}

export function computeSnake(
  players: LiveScorePlayer[],
  events: SnakeEvent[],
): Leaderboard {
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (const e of events) {
    if (e.matchPlayerId in counts) counts[e.matchPlayerId] += 1;
  }
  const holders = snakeHolders(events);
  const rows = players.map((p) => {
    const n = counts[p.id] ?? 0;
    const isHolder = holders.has(p.id);
    return {
      playerId: p.id,
      player: p.displayName,
      // numeric is the 3-putt count; lower is better in this game.
      numeric: n,
      value: isHolder
        ? `${n} 3-putt${n === 1 ? "" : "s"} · holder`
        : `${n} 3-putt${n === 1 ? "" : "s"}`,
    };
  });
  // Lower 3-putt count = better, so rank ascending (no higherIsBetter).
  return {
    key: "SNAKE",
    kind: "SNAKE",
    title: "Snake",
    subtitle:
      events.length === 0
        ? "No 3-putts yet"
        : `Snake holder: ${players
            .filter((p) => holders.has(p.id))
            .map((p) => p.displayName)
            .join(", ")}`,
    rows: rankRows(rows, false),
  };
}

export function runningSnake(
  players: LiveScorePlayer[],
  holes: number,
  events: SnakeEvent[],
): RunningSeries {
  const through = Math.min(
    holes,
    events.length === 0 ? 0 : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = 1; h <= through; h++) {
    for (const e of events) {
      if (e.hole === h && e.matchPlayerId in totals) {
        totals[e.matchPlayerId] += 1;
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

// Dispatch: compute all enabled side games for a match. BBB needs the extra
// `bbbEvents` input since it's not derivable from strokes alone.
export function computeAllSideGames(input: {
  enabled: SideGameKind[];
  players: LiveScorePlayer[];
  pars: number[];
  holes: number;
  scoringMode: ScoringMode;
  bbbEvents?: BbbEvent[];
  snakeEvents?: SnakeEvent[];
}): { kind: SideGameKind; leaderboards: Leaderboard[] }[] {
  const {
    enabled,
    players,
    pars,
    holes,
    scoringMode,
    bbbEvents = [],
    snakeEvents = [],
  } = input;
  const out: { kind: SideGameKind; leaderboards: Leaderboard[] }[] = [];
  for (const kind of enabled) {
    if (kind === "STABLEFORD") {
      out.push({
        kind,
        leaderboards: [computeStableford(players, pars, holes, scoringMode)],
      });
    } else if (kind === "SKINS") {
      out.push({
        kind,
        leaderboards: [computeSkins(players, pars, holes, scoringMode)],
      });
    } else if (kind === "NASSAU") {
      const lbs = computeNassau(players, pars, holes, scoringMode);
      if (lbs.length > 0) out.push({ kind, leaderboards: lbs });
    } else if (kind === "BBB") {
      out.push({ kind, leaderboards: [computeBbb(players, bbbEvents)] });
    } else if (kind === "SNAKE") {
      out.push({ kind, leaderboards: [computeSnake(players, snakeEvents)] });
    }
  }
  return out;
}

export function isSideGameKind(s: string): s is SideGameKind {
  return (
    s === "STABLEFORD" ||
    s === "SKINS" ||
    s === "NASSAU" ||
    s === "BBB" ||
    s === "SNAKE"
  );
}

// ---- Running (hole-by-hole) series for charts ---------------------------
// Each function returns rows of the form { hole: N, [playerId]: value } so
// the chart layer can pass it directly to Recharts.

export type RunningSeries = {
  rows: ({ hole: number } & Record<string, number>)[];
  // The cumulative value at the final available hole, per player. Used as
  // the chart's "current" label.
  current: Record<string, number>;
  // Highest plotted hole index (for the X domain).
  throughHole: number;
};

function maxHolesAcross(players: LiveScorePlayer[]): number {
  return Math.max(
    0,
    ...players.map((p) => {
      const keys = Object.keys(p.scoresByHole).map(Number);
      return keys.length === 0 ? 0 : Math.max(...keys);
    }),
  );
}

export function runningStableford(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): RunningSeries {
  const through = Math.min(holes, maxHolesAcross(players));
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = 1; h <= through; h++) {
    for (const p of players) {
      const gross = p.scoresByHole[h];
      if (typeof gross === "number") {
        const par = pars[h - 1] ?? 4;
        const net = netStrokesForHole(
          gross,
          p.handicap,
          h - 1,
          holes,
          scoringMode,
        );
        totals[p.id] = (totals[p.id] ?? 0) + stablefordPointsFromNet(net, par);
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

export function runningSkins(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): RunningSeries {
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  let carryover = 1;
  let through = 0;
  for (let h = 1; h <= holes; h++) {
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        h - 1,
        holes,
        scoringMode,
      ),
    }));
    const low = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === low);
    if (winners.length === 1) {
      counts[winners[0].id] += carryover;
      carryover = 1;
    } else {
      carryover += 1;
    }
    rows.push({ hole: h, ...counts });
    through = h;
  }
  return { rows, current: { ...counts }, throughHole: through };
}

// Nassau running net relative to par over a segment (front/back/total).
// X = hole offset within the segment (1..segLength), Y = net-to-par.
export function runningNassauSegment(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  start1: number,
  end1: number,
): RunningSeries {
  const through = Math.min(end1, maxHolesAcross(players));
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const running: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  let lastHole = 0;
  for (let h = start1; h <= through; h++) {
    for (const p of players) {
      const gross = p.scoresByHole[h];
      if (typeof gross === "number") {
        const par = pars[h - 1] ?? 4;
        const net = netStrokesForHole(
          gross,
          p.handicap,
          h - 1,
          holes,
          scoringMode,
        );
        running[p.id] = (running[p.id] ?? 0) + (net - par);
      }
    }
    rows.push({ hole: h - start1 + 1, ...running });
    lastHole = h;
  }
  return {
    rows,
    current: { ...running },
    throughHole: lastHole === 0 ? 0 : lastHole - start1 + 1,
  };
}
