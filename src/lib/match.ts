import { prisma } from "./db";
import { computeOdds, parseParData, type PlayerInput } from "./odds";

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
    },
  });
  if (!match) return null;

  const pars = parseParData(match.parData, match.holes);

  const playerInputs: PlayerInput[] = match.players.map((p) => ({
    id: p.id,
    handicap: p.handicap,
    wagerCount: p._count.wagers,
    scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
  }));

  const odds = computeOdds({
    status: match.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: match.holes,
    pars,
    players: playerInputs,
  });

  return { match, odds, pars };
}

export async function recordOddsSnapshot(matchId: string) {
  const loaded = await loadMatchWithOdds(matchId);
  if (!loaded) return;
  const { match, odds } = loaded;
  await prisma.$transaction(
    match.players.map((p) =>
      prisma.oddsSnapshot.create({
        data: {
          matchId: match.id,
          matchPlayerId: p.id,
          probability: odds.probabilities[p.id] ?? 0,
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
