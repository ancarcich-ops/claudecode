import { prisma } from "./db";
import {
  computeOdds,
  parseParData,
  type PlayerInput,
  type ScoringMode,
} from "./odds";
import {
  captainForTeam,
  partitionTeams,
  parseScrambleConfig,
  teamHandicap,
} from "./scramble";

export async function loadMatchWithOdds(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      createdBy: true,
      players: {
        orderBy: { seat: "asc" },
        include: {
          scores: true,
          _count: { select: { wagers: true } },
        },
      },
      wagers: { include: { user: true, pickedPlayer: true } },
      oddsSnapshots: { orderBy: { createdAt: "asc" } },
      sideGames: { include: { events: true } },
    },
  });
  if (!match) return null;

  const pars = parseParData(match.parData, match.holes);

  const scoringMode: ScoringMode =
    match.scoringMode === "GROSS"
      ? "GROSS"
      : match.scoringMode === "CUSTOM"
        ? "CUSTOM"
        : "NET";

  // Scramble matches feed the odds engine a synthetic per-team player
  // list instead of the raw per-player list -- the engine doesn't need
  // to know about scramble, it just sees N=2 entities competing. The
  // captain (lowest-seat teammate) carries the team's score entries +
  // wagers; team handicap is computed per the scramble config.
  const isScramble = match.format === "SCRAMBLE";
  const scrambleConfig = isScramble
    ? parseScrambleConfig(match.scrambleConfig)
    : null;

  let playerInputs: PlayerInput[];
  if (isScramble && scrambleConfig) {
    const teams = partitionTeams(match.players);
    playerInputs = ([0, 1] as const)
      .map((t) => {
        const team = teams[t];
        if (team.length === 0) return null;
        const captain = captainForTeam(team)!;
        return {
          id: `team-${t}`,
          handicap: teamHandicap(team, scrambleConfig.handicapMode),
          // Team wager count = wagers placed on any player in the team.
          wagerCount: team.reduce(
            (sum, p) => sum + p._count.wagers,
            0,
          ),
          scoresByHole: Object.fromEntries(
            captain.scores.map((s) => [s.hole, s.strokes]),
          ),
        };
      })
      .filter((x): x is PlayerInput => x != null);
  } else {
    playerInputs = match.players.map((p) => ({
      id: p.id,
      handicap: p.handicap,
      wagerCount: p._count.wagers,
      scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
    }));
  }

  const odds = computeOdds({
    status: match.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: match.holes,
    startingHole: match.startingHole ?? 1,
    pars,
    scoringMode,
    players: playerInputs,
  });

  return { match, odds, pars };
}

export async function recordOddsSnapshot(matchId: string) {
  const loaded = await loadMatchWithOdds(matchId);
  if (!loaded) return;
  const { match, odds } = loaded;
  // For scramble matches the odds engine produced team probabilities
  // keyed "team-0" / "team-1"; mirror each team's prob onto every
  // teammate's OddsSnapshot row so the existing per-player snapshot
  // model keeps working unchanged. UI consumers that care about teams
  // already partition by team and de-dup.
  const isScramble = match.format === "SCRAMBLE";
  const probFor = (p: (typeof match.players)[number]): number => {
    if (isScramble) {
      const team = p.team;
      if (team !== 0 && team !== 1) return 0;
      return odds.probabilities[`team-${team}`] ?? 0;
    }
    return odds.probabilities[p.id] ?? 0;
  };
  await prisma.$transaction(
    match.players.map((p) =>
      prisma.oddsSnapshot.create({
        data: {
          matchId: match.id,
          matchPlayerId: p.id,
          probability: probFor(p),
        },
      }),
    ),
  );
}

// Cheap version stamp used for client-side polling. Combines the match's
// updatedAt with the latest snapshot timestamp so any wager / score / status
// change bumps it.
export async function getMatchVersion(matchId: string): Promise<string> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      updatedAt: true,
      status: true,
      oddsSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  if (!m) return "missing";
  const snap = m.oddsSnapshots[0]?.createdAt.getTime() ?? 0;
  return `${m.updatedAt.getTime()}.${snap}.${m.status}`;
}

export async function getMarketsVersion(): Promise<string> {
  const latest = await prisma.match.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  const lastSnap = await prisma.oddsSnapshot.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return `${latest?.updatedAt.getTime() ?? 0}.${
    lastSnap?.createdAt.getTime() ?? 0
  }`;
}
