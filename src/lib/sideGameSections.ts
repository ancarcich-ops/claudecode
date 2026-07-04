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
  type SideGameKind,
  type BbbEvent,
  type SnakeEvent,
  type WolfEvent,
} from "./sideGames";

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

export function computeSideGameSectionsForMatch(
  match: {
    holes: number;
    startingHole: number | null;
    scoringMode: string;
    players: LoadedPlayer[];
    sideGames: LoadedSideGame[] | null;
  },
  pars: number[],
) {
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

  return computeAllSideGames({
    enabled: enabledKinds,
    players: playerInputs,
    wolfPlayers: seatedWolfPlayers,
    pars,
    holes: match.holes,
    scoringMode,
    startingHole: matchStart,
    bbbEvents,
    snakeEvents,
    wolfEvents,
    wolfConfig,
    teamVsTeamConfig,
    targetsConfig,
    matchConfig,
    matchEvents,
    sixesConfig,
    skinsConfig,
  });
}
