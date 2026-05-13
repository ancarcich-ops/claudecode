import { prisma } from "./db";
import { computeOdds, type PlayerInput } from "./odds";

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

  const playerInputs: PlayerInput[] = match.players.map((p) => ({
    id: p.id,
    handicap: p.handicap,
    wagerCount: p._count.wagers,
    scoresByHole: Object.fromEntries(p.scores.map((s) => [s.hole, s.strokes])),
  }));

  const odds = computeOdds({
    status: match.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: match.holes,
    players: playerInputs,
  });

  return { match, odds };
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
