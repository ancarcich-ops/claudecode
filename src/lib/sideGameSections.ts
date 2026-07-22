// Side-game leaderboard sections for a loaded match.
//
// This is the same input assembly the match detail page does inline
// (src/app/matches/[id]/page.tsx, "Side-game leaderboards" block),
// extracted so the mobile API can serve identical standings. If you
// change the assembly rules there, mirror them here.

import {
  computeAllSideGames,
  isSideGameKind,
  isBbbEventKind,
  isSnakeEventKind,
  isWolfEventKind,
  parseWolfConfig,
  parseSkinsConfig,
  parseTeamVsTeamConfig,
  parseTargetsConfig,
  parseMatchConfig,
  parseSixesConfig,
  parseStablefordConfig,
  parseBbbConfig,
  parseSnakeConfig,
  parseNassauConfig,
  isNassauEventKind,
  runningStableford,
  runningSkins,
  runningNassauSegment,
  runningBbb,
  runningSnake,
  runningWolf,
  runningMatch,
  runningSixes,
  type SideGameKind,
  type BbbEvent,
  type SnakeEvent,
  type WolfEvent,
} from "./sideGames";

// Per-market cumulative chart series for a match -- one entry per
// enabled side game, each a list of per-hole rows keyed by player id.
// Mirrors the web match page's `sgSeries` (src/app/matches/[id]/page.tsx)
// so the mobile Live-odds graphs can match the web exactly.
export type SgChartRow = { hole: number } & Record<string, number>;
export type SideGameSeries = {
  stableford?: { rows: SgChartRow[] };
  skins?: { rows: SgChartRow[] };
  nassauF9?: { rows: SgChartRow[] };
  nassauB9?: { rows: SgChartRow[] };
  nassauTotal?: { rows: SgChartRow[] };
  bbb?: { rows: SgChartRow[] };
  snake?: { rows: SgChartRow[] };
  wolf?: { rows: SgChartRow[] };
  match?: { rows: SgChartRow[] };
  sixes?: { rows: SgChartRow[] };
};

type LoadedSideGame = {
  kind: string;
  config: string | null;
  events: { hole: number; kind: string; matchPlayerId: string | null }[];
};

type LoadedPlayer = {
  id: string;
  seat: number;
  displayName: string;
  handicap: number;
  scores: { hole: number; strokes: number }[];
};

type MatchForSideGames = {
  holes: number;
  startingHole: number | null;
  scoringMode: string;
  players: LoadedPlayer[];
  sideGames: LoadedSideGame[] | null;
};

// Shared input assembly for both the standings sections and the chart
// series, so the two never drift. Parses every side-game config/event
// and builds the player-score inputs the compute/running helpers need.
function deriveSideGameInputs(match: MatchForSideGames, pars: number[]) {
  const scoringMode =
    match.scoringMode === "GROSS"
      ? ("GROSS" as const)
      : match.scoringMode === "CUSTOM"
        ? ("CUSTOM" as const)
        : ("NET" as const);
  const matchStart = match.startingHole ?? 1;

  // Filter persisted kinds against the known set in case a kind was
  // deprecated since this match was created.
  const enabledKinds: SideGameKind[] = (match.sideGames ?? [])
    .map((sg) => sg.kind)
    .filter(isSideGameKind);

  const sideGames = match.sideGames ?? [];
  const bbbGame = sideGames.find((sg) => sg.kind === "BBB");
  const bbbEvents: BbbEvent[] = (bbbGame?.events ?? [])
    .filter((e) => isBbbEventKind(e.kind))
    .map((e) => ({
      hole: e.hole,
      kind: e.kind as BbbEvent["kind"],
      matchPlayerId: e.matchPlayerId ?? null,
    }));
  const snakeGame = sideGames.find((sg) => sg.kind === "SNAKE");
  const snakeEvents: SnakeEvent[] = (snakeGame?.events ?? [])
    .filter((e) => isSnakeEventKind(e.kind) && e.matchPlayerId)
    .map((e) => ({
      hole: e.hole,
      matchPlayerId: e.matchPlayerId as string,
    }));
  const wolfGame = sideGames.find((sg) => sg.kind === "WOLF");
  const wolfEvents: WolfEvent[] = (wolfGame?.events ?? [])
    .filter((e) => isWolfEventKind(e.kind))
    .map((e) => ({
      hole: e.hole,
      kind: e.kind as WolfEvent["kind"],
      matchPlayerId: e.matchPlayerId ?? null,
    }));
  const wolfConfig = parseWolfConfig(wolfGame?.config ?? null);
  const skinsGame = sideGames.find((sg) => sg.kind === "SKINS");
  const skinsConfig = parseSkinsConfig(skinsGame?.config ?? null);
  // Match press events: one row per pressed hole; matchPlayerId unused.
  const matchEventGame = sideGames.find((sg) => sg.kind === "MATCH");
  const matchEvents: { hole: number; kind: "PRESS" }[] = (
    matchEventGame?.events ?? []
  )
    .filter((e) => e.kind === "PRESS")
    .map((e) => ({ hole: e.hole, kind: "PRESS" as const }));
  // Nassau press events + config (2-player auto/manual presses).
  const nassauGame = sideGames.find((sg) => sg.kind === "NASSAU");
  const nassauEvents: { hole: number; kind: "PRESS" }[] = (
    nassauGame?.events ?? []
  )
    .filter((e) => isNassauEventKind(e.kind))
    .map((e) => ({ hole: e.hole, kind: "PRESS" as const }));
  const nassauConfig = nassauGame
    ? parseNassauConfig(nassauGame.config)
    : null;
  const tvtSideGame = sideGames.find((sg) => sg.kind === "TEAM_VS_TEAM");
  const teamVsTeamConfig = tvtSideGame
    ? parseTeamVsTeamConfig(tvtSideGame.config)
    : null;
  const targetsSideGame = sideGames.find((sg) => sg.kind === "TARGETS");
  const targetsConfig = targetsSideGame
    ? parseTargetsConfig(targetsSideGame.config)
    : null;
  const matchSideGame = sideGames.find((sg) => sg.kind === "MATCH");
  const matchConfig = matchSideGame
    ? parseMatchConfig(matchSideGame.config)
    : null;
  const sixesSideGame = sideGames.find((sg) => sg.kind === "SIXES");
  const sixesConfig = sixesSideGame
    ? parseSixesConfig(sixesSideGame.config)
    : null;
  const stablefordSideGame = sideGames.find((sg) => sg.kind === "STABLEFORD");
  const stablefordConfig = stablefordSideGame
    ? parseStablefordConfig(stablefordSideGame.config)
    : null;
  const bbbSideGame = sideGames.find((sg) => sg.kind === "BBB");
  const bbbConfig = bbbSideGame ? parseBbbConfig(bbbSideGame.config) : null;
  const snakeSideGame = sideGames.find((sg) => sg.kind === "SNAKE");
  const snakeConfig = snakeSideGame
    ? parseSnakeConfig(snakeSideGame.config)
    : null;

  const playerInputs = match.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    handicap: p.handicap,
    scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
  }));
  // Seat-aware players (only needed for Wolf rotation).
  const seatedWolfPlayers = match.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    displayName: p.displayName,
    handicap: p.handicap,
    scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
  }));

  return {
    scoringMode,
    matchStart,
    holes: match.holes,
    enabledKinds,
    bbbEvents,
    snakeEvents,
    wolfEvents,
    wolfConfig,
    skinsConfig,
    matchEvents,
    nassauEvents,
    nassauConfig,
    teamVsTeamConfig,
    targetsConfig,
    matchConfig,
    sixesConfig,
    stablefordConfig,
    bbbConfig,
    snakeConfig,
    playerInputs,
    seatedWolfPlayers,
  };
}

// Per-market cumulative chart series for the mobile Live-odds graphs.
// Mirrors the web match page's sgSeries block exactly (same guards:
// Nassau/Sixes need 18 holes; Sixes needs 4 players).
export function computeSideGameSeriesForMatch(
  match: MatchForSideGames,
  pars: number[],
): SideGameSeries {
  const d = deriveSideGameInputs(match, pars);
  const series: SideGameSeries = {};

  if (d.enabledKinds.includes("STABLEFORD")) {
    series.stableford = runningStableford(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      d.matchStart,
      d.stablefordConfig,
    );
  }
  if (d.enabledKinds.includes("SKINS")) {
    series.skins = runningSkins(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      d.matchStart,
    );
  }
  if (d.enabledKinds.includes("NASSAU") && d.holes === 18) {
    series.nassauF9 = runningNassauSegment(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      1,
      9,
    );
    series.nassauB9 = runningNassauSegment(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      10,
      18,
    );
    series.nassauTotal = runningNassauSegment(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      1,
      18,
    );
  }
  if (d.enabledKinds.includes("BBB")) {
    series.bbb = runningBbb(
      d.playerInputs,
      d.holes,
      d.bbbEvents,
      d.matchStart,
      d.bbbConfig,
    );
  }
  if (d.enabledKinds.includes("SNAKE")) {
    series.snake = runningSnake(
      d.playerInputs,
      d.holes,
      d.snakeEvents,
      d.matchStart,
    );
  }
  if (d.enabledKinds.includes("WOLF")) {
    series.wolf = runningWolf(
      d.seatedWolfPlayers,
      d.holes,
      d.wolfEvents,
      d.wolfConfig,
      d.matchStart,
    );
  }
  if (d.enabledKinds.includes("MATCH")) {
    series.match = runningMatch(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      d.matchStart,
      d.matchConfig,
      d.matchEvents,
    );
  }
  if (
    d.enabledKinds.includes("SIXES") &&
    d.holes === 18 &&
    d.playerInputs.length === 4
  ) {
    series.sixes = runningSixes(
      d.playerInputs,
      pars,
      d.holes,
      d.scoringMode,
      d.matchStart,
    );
  }

  return series;
}

export function computeSideGameSectionsForMatch(
  match: MatchForSideGames,
  pars: number[],
) {
  const d = deriveSideGameInputs(match, pars);
  return computeAllSideGames({
    enabled: d.enabledKinds,
    players: d.playerInputs,
    wolfPlayers: d.seatedWolfPlayers,
    pars,
    holes: d.holes,
    scoringMode: d.scoringMode,
    startingHole: d.matchStart,
    bbbEvents: d.bbbEvents,
    snakeEvents: d.snakeEvents,
    wolfEvents: d.wolfEvents,
    wolfConfig: d.wolfConfig,
    teamVsTeamConfig: d.teamVsTeamConfig,
    targetsConfig: d.targetsConfig,
    matchConfig: d.matchConfig,
    matchEvents: d.matchEvents,
    sixesConfig: d.sixesConfig,
    skinsConfig: d.skinsConfig,
    stablefordConfig: d.stablefordConfig,
    bbbConfig: d.bbbConfig,
    snakeConfig: d.snakeConfig,
    nassauConfig: d.nassauConfig,
    nassauEvents: d.nassauEvents,
  });
}
