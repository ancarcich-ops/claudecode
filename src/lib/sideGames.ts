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
  | "SNAKE"
  | "WOLF";

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

export const WOLF_EVENT_KINDS = [
  "PARTNER",
  "LONE_WOLF",
  "PRE_LONE_WOLF",
  "HOLE_WINNER",
  "PUSH",
] as const;
export type WolfEventKind = (typeof WOLF_EVENT_KINDS)[number];

export function isWolfEventKind(s: string): s is WolfEventKind {
  return (WOLF_EVENT_KINDS as readonly string[]).includes(s);
}

// Per-match Wolf configuration. Stored as JSON on SideGame.config when
// the creator deviates from defaults; absent means use defaults.
//   rotation: optional list of matchPlayerId in turn order. Wolf for hole
//             N is rotation[(N-1) % rotation.length]. Defaults to seat
//             order.
//   pushRule: how pushed holes (HOLE_WINNER missing, PUSH recorded) score.
//             - NO_POINTS (default): pushed hole awards nothing, move on.
//             - ROLLOVER: a push increments a carry counter; the next
//               resolved hole's points are multiplied by (1 + carry).
export type WolfPushRule = "NO_POINTS" | "ROLLOVER";
export type WolfConfig = {
  rotation?: string[];
  pushRule?: WolfPushRule;
};

export function parseWolfConfig(s: string | null | undefined): WolfConfig {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    if (typeof v !== "object" || v === null) return {};
    const out: WolfConfig = {};
    if (Array.isArray(v.rotation) && v.rotation.every((x: unknown) => typeof x === "string")) {
      out.rotation = v.rotation;
    }
    if (v.pushRule === "ROLLOVER" || v.pushRule === "NO_POINTS") {
      out.pushRule = v.pushRule;
    }
    return out;
  } catch {
    return {};
  }
}

export function stringifyWolfConfig(c: WolfConfig): string {
  return JSON.stringify(c);
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
  {
    kind: "WOLF",
    label: "Wolf",
    blurb:
      "Rotating wolf per hole picks a partner or goes solo. Win lone = +4.",
  },
];

// Future kinds: surfaced in the UI as 'coming soon' so users can see the
// roadmap without us implementing them yet. (Empty now -- all six games
// are wired in.)
export const COMING_SOON_SIDE_GAMES: { kind: string; label: string; blurb: string }[] = [];

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
  startingHole: number = 1,
): Leaderboard {
  const rows = players.map((p) => {
    let points = 0;
    let counted = 0;
    for (let i = 0; i < holes; i++) {
      const gross = p.scoresByHole[startingHole + i];
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
  startingHole: number = 1,
): Leaderboard {
  const skinsByPlayer = new Map<string, number>();
  for (const p of players) skinsByPlayer.set(p.id, 0);

  let carryover = 1;
  let openHole = 0;

  for (let i = 0; i < holes; i++) {
    const h = startingHole + i;
    // Only resolve holes where every player has a score.
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) {
      break;
    }
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[h] as number,
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
    openHole = h;
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
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(
    lastHole,
    events.length === 0
      ? startingHole - 1
      : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
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
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(
    lastHole,
    events.length === 0
      ? startingHole - 1
      : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
    for (const e of events) {
      if (e.hole === h && e.matchPlayerId in totals) {
        totals[e.matchPlayerId] += 1;
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

// ---- Wolf ---------------------------------------------------------------
// Wolf rotates by seat order: player at seat ((hole - 1) % N) is the Wolf
// for hole N. Per hole the Wolf either picks a PARTNER (2v2) or goes
// LONE_WOLF (1 v N-1). HOLE_WINNER points to any player on the winning
// team; scoring derives team membership from PARTNER/LONE_WOLF.
//
// Scoring (most common amateur variant):
//   Partner team wins:  Wolf and partner each +2
//   Opponents win:      each opponent +1
//   Lone Wolf wins:     Wolf +4
//   Lone Wolf loses:    each opponent +1
//
// Pre-declared Lone Wolf (double stakes) is intentionally skipped in v1.

export type WolfEvent = {
  hole: number;
  kind: WolfEventKind;
  matchPlayerId: string | null;
};

export type WolfPlayer = LiveScorePlayer & { seat: number };

export function wolfForHole(
  players: WolfPlayer[],
  hole: number,
  rotation?: string[],
  startingHole: number = 1,
): WolfPlayer | null {
  if (players.length === 0) return null;
  // If a custom rotation is provided, use it. Drop any ids no longer in the
  // player list (e.g. someone got removed after the rotation was set), and
  // fall back to seat order if the result is empty.
  let ordered: WolfPlayer[] = [];
  if (rotation && rotation.length > 0) {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const id of rotation) {
      const p = byId.get(id);
      if (p) ordered.push(p);
    }
  }
  if (ordered.length === 0) {
    ordered = [...players].sort((a, b) => a.seat - b.seat);
  }
  // Rotate based on offset from the first hole played, not absolute hole #.
  return ordered[(hole - startingHole) % ordered.length];
}

type WolfHole = {
  hole: number;
  wolfId: string;
  partnerId: string | null;
  isLoneWolf: boolean;
  // Pre-declared lone wolf (called before any tee shot) -- doubles the stake.
  isPreLoneWolf: boolean;
  winnerId: string | null;
  isPush: boolean;
};

export function shapeWolfHoles(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  rotation?: string[],
  startingHole: number = 1,
): WolfHole[] {
  const byHole = new Map<number, WolfEvent[]>();
  for (const e of events) {
    if (!byHole.has(e.hole)) byHole.set(e.hole, []);
    byHole.get(e.hole)!.push(e);
  }
  const out: WolfHole[] = [];
  const lastHole = startingHole + holes - 1;
  for (let h = startingHole; h <= lastHole; h++) {
    const wolf = wolfForHole(players, h, rotation, startingHole);
    if (!wolf) continue;
    const es = byHole.get(h) ?? [];
    const partner = es.find((e) => e.kind === "PARTNER");
    const lone = es.find((e) => e.kind === "LONE_WOLF");
    const preLone = es.find((e) => e.kind === "PRE_LONE_WOLF");
    const manualWinner = es.find((e) => e.kind === "HOLE_WINNER");
    const manualPush = es.some((e) => e.kind === "PUSH");

    // Auto-derive winner from logged scores when (a) no manual winner /
    // push has been recorded, and (b) the wolf has already committed to
    // a partner / lone-wolf choice for the hole. Best-ball within each
    // team -- ties between teams are pushes.
    const partnerId = partner?.matchPlayerId ?? null;
    const isLoneWolf = !!lone || !!preLone;
    const hasChoice = !!partner || isLoneWolf;
    let derivedWinnerId: string | null = null;
    let derivedPush = false;

    if (!manualWinner && !manualPush && hasChoice && players.length >= 2) {
      const strokeFor = (id: string) => players.find((p) => p.id === id)?.scoresByHole[h];
      const wolfStrokes = strokeFor(wolf.id);
      const partnerStrokes = partnerId ? strokeFor(partnerId) : undefined;
      const opponentIds = players
        .map((p) => p.id)
        .filter((id) => id !== wolf.id && id !== partnerId);
      const opponentStrokeList = opponentIds
        .map((id) => strokeFor(id))
        .filter((v): v is number => typeof v === "number");

      const wolfReady = typeof wolfStrokes === "number";
      const partnerReady = !partnerId || typeof partnerStrokes === "number";
      const oppsReady = opponentStrokeList.length === opponentIds.length;
      if (wolfReady && partnerReady && oppsReady) {
        const wolfTeamScore =
          isLoneWolf || !partnerId
            ? (wolfStrokes as number)
            : Math.min(wolfStrokes as number, partnerStrokes as number);
        const oppTeamScore = Math.min(...opponentStrokeList);
        if (wolfTeamScore < oppTeamScore) {
          derivedWinnerId = wolf.id;
        } else if (oppTeamScore < wolfTeamScore) {
          // Pick the lowest-scoring opponent as the team representative
          // so scoreWolfHole still classifies the winning side correctly.
          const idx = opponentStrokeList.indexOf(oppTeamScore);
          derivedWinnerId = opponentIds[idx];
        } else {
          derivedPush = true;
        }
      }
    }

    out.push({
      hole: h,
      wolfId: wolf.id,
      partnerId,
      isLoneWolf,
      isPreLoneWolf: !!preLone,
      winnerId: manualWinner?.matchPlayerId ?? derivedWinnerId,
      isPush: manualPush || derivedPush,
    });
  }
  return out;
}

function scoreWolfHole(
  shaped: WolfHole,
  playerIds: string[],
): Record<string, number> {
  const pts: Record<string, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  if (!shaped.winnerId) return pts;
  const N = playerIds.length;
  // Player-count-aware scoring:
  //   3 players (always solo): wolf win = 2; others win = 1 each
  //   4 players solo:          wolf win = 3; others win = 1 each
  //   4 players partner:       winning team = 2 each; losing team = 0
  //   5+ (fallback):           wolf solo win = N - 1; others 1 each
  //                            partner: winning team = 2 each; losing = 0
  if (shaped.isLoneWolf) {
    // Pre-declared (called BEFORE any tee shot) doubles the stake -- standard
    // golf-bar Wolf rule.
    const multiplier = shaped.isPreLoneWolf ? 2 : 1;
    if (shaped.winnerId === shaped.wolfId) {
      pts[shaped.wolfId] = (N - 1) * multiplier;
    } else {
      for (const id of playerIds) {
        if (id !== shaped.wolfId) pts[id] = 1 * multiplier;
      }
    }
    return pts;
  }
  if (shaped.partnerId) {
    const wolfTeam = new Set([shaped.wolfId, shaped.partnerId]);
    if (wolfTeam.has(shaped.winnerId)) {
      // Wolf team wins -- they get 2 each. Losing team gets 0.
      pts[shaped.wolfId] = 2;
      pts[shaped.partnerId] = 2;
    } else {
      // Opponents win. Standard rule: winners get 2 each, losers 0. For
      // 5+ players we keep the legacy 1-each on the opponent side so the
      // pot doesn't inflate, but at N=4 it's the symmetric 2/0.
      const opponentPts = N === 4 ? 2 : 1;
      for (const id of playerIds) {
        if (!wolfTeam.has(id)) pts[id] = opponentPts;
      }
    }
  }
  return pts;
}

// Single pass over shaped Wolf holes that applies the push rule. Returns
// per-player running totals plus a hole-by-hole snapshot for the chart.
function tallyWolfHoles(
  shaped: WolfHole[],
  playerIds: string[],
  pushRule: WolfPushRule,
): {
  totals: Record<string, number>;
  rows: ({ hole: number } & Record<string, number>)[];
  resolvedHoles: number;
  lastResolved: number;
} {
  const totals: Record<string, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  let resolvedHoles = 0;
  let lastResolved = 0;
  let carry = 0; // # of pushed holes awaiting payout (ROLLOVER mode only)
  for (const shaped_ of shaped) {
    if (shaped_.isPush) {
      // Pushed hole. Either drag the stake forward or zero it.
      if (pushRule === "ROLLOVER") {
        carry += 1;
        // No row emitted -- the chart line stays flat through pushes.
      }
      continue;
    }
    if (!shaped_.winnerId) continue;
    const add = scoreWolfHole(shaped_, playerIds);
    const multiplier = pushRule === "ROLLOVER" ? 1 + carry : 1;
    for (const id of playerIds) totals[id] += (add[id] ?? 0) * multiplier;
    carry = 0;
    resolvedHoles++;
    lastResolved = shaped_.hole;
    rows.push({ hole: shaped_.hole, ...totals });
  }
  return { totals, rows, resolvedHoles, lastResolved };
}

export function computeWolf(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  config: WolfConfig = {},
  startingHole: number = 1,
): Leaderboard {
  const ids = players.map((p) => p.id);
  const pushRule = config.pushRule ?? "NO_POINTS";
  const shaped = shapeWolfHoles(
    players,
    holes,
    events,
    config.rotation,
    startingHole,
  );
  const { totals, resolvedHoles } = tallyWolfHoles(shaped, ids, pushRule);
  const pushed = shaped.filter((s) => s.isPush).length;
  const rows = players.map((p) => ({
    playerId: p.id,
    player: p.displayName,
    numeric: totals[p.id] ?? 0,
    value: `${totals[p.id] ?? 0} pt${(totals[p.id] ?? 0) === 1 ? "" : "s"}`,
  }));
  const parts: string[] = [];
  if (resolvedHoles === 0 && pushed === 0) {
    parts.push("No holes resolved yet");
  } else {
    parts.push(`${resolvedHoles}/${holes} resolved`);
    if (pushed > 0) {
      parts.push(
        `${pushed} push${pushed === 1 ? "" : "es"}${
          pushRule === "ROLLOVER" ? " · rolling over" : ""
        }`,
      );
    }
  }
  return {
    key: "WOLF",
    kind: "WOLF",
    title: "Wolf",
    subtitle: parts.join(" · "),
    rows: rankRows(rows, true),
  };
}

export function runningWolf(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  config: WolfConfig = {},
  startingHole: number = 1,
): RunningSeries {
  const ids = players.map((p) => p.id);
  const pushRule = config.pushRule ?? "NO_POINTS";
  const shaped = shapeWolfHoles(
    players,
    holes,
    events,
    config.rotation,
    startingHole,
  );
  const { totals, rows, lastResolved } = tallyWolfHoles(shaped, ids, pushRule);
  return { rows, current: { ...totals }, throughHole: lastResolved };
}

// Dispatch: compute all enabled side games for a match. BBB / Snake / Wolf
// need their event lists since they're not derivable from strokes alone.
export function computeAllSideGames(input: {
  enabled: SideGameKind[];
  players: LiveScorePlayer[];
  // Seat-aware players (only needed for Wolf rotation; ignored elsewhere).
  wolfPlayers?: WolfPlayer[];
  pars: number[];
  holes: number;
  scoringMode: ScoringMode;
  startingHole?: number;
  bbbEvents?: BbbEvent[];
  snakeEvents?: SnakeEvent[];
  wolfEvents?: WolfEvent[];
  wolfConfig?: WolfConfig;
}): { kind: SideGameKind; leaderboards: Leaderboard[] }[] {
  const {
    enabled,
    players,
    wolfPlayers = [],
    pars,
    holes,
    scoringMode,
    startingHole = 1,
    bbbEvents = [],
    snakeEvents = [],
    wolfEvents = [],
    wolfConfig = {},
  } = input;
  const out: { kind: SideGameKind; leaderboards: Leaderboard[] }[] = [];
  for (const kind of enabled) {
    if (kind === "STABLEFORD") {
      out.push({
        kind,
        leaderboards: [
          computeStableford(players, pars, holes, scoringMode, startingHole),
        ],
      });
    } else if (kind === "SKINS") {
      out.push({
        kind,
        leaderboards: [
          computeSkins(players, pars, holes, scoringMode, startingHole),
        ],
      });
    } else if (kind === "NASSAU") {
      const lbs = computeNassau(players, pars, holes, scoringMode);
      if (lbs.length > 0) out.push({ kind, leaderboards: lbs });
    } else if (kind === "BBB") {
      out.push({ kind, leaderboards: [computeBbb(players, bbbEvents)] });
    } else if (kind === "SNAKE") {
      out.push({ kind, leaderboards: [computeSnake(players, snakeEvents)] });
    } else if (kind === "WOLF") {
      out.push({
        kind,
        leaderboards: [
          computeWolf(
            wolfPlayers,
            holes,
            wolfEvents,
            wolfConfig,
            startingHole,
          ),
        ],
      });
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
    s === "SNAKE" ||
    s === "WOLF"
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
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(lastHole, maxHolesAcross(players));
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
    const offset = h - startingHole;
    for (const p of players) {
      const gross = p.scoresByHole[h];
      if (typeof gross === "number") {
        const par = pars[offset] ?? 4;
        const net = netStrokesForHole(
          gross,
          p.handicap,
          offset,
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
  startingHole: number = 1,
): RunningSeries {
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  let carryover = 1;
  let through = 0;
  const lastHole = startingHole + holes - 1;
  for (let h = startingHole; h <= lastHole; h++) {
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const offset = h - startingHole;
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        offset,
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
