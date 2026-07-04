// GET /api/mobile/matches
// Auth: Bearer token.
// Returns the caller's matches (creator or seated), most recent first.
// Carries enough per-match data for the home feed's match cards: pars
// + every player's scores (the colored hole dot-row, momentum, and
// standings context are all client-derivable from those), plus avatar
// fields and completedAt.
// 200: { matches: [{ id, courseName, scheduledAt, completedAt, status,
//        holes, startingHole, scoringMode, format, pars,
//        myMatchPlayerId, players: [{ id, userId, displayName, seat,
//        handicap, avatarUrl, avatarSeed, avatarVariant,
//        scoresByHole }] }] }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { parseParData } from "@/lib/odds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { createdById: user.id },
        { players: { some: { userId: user.id } } },
      ],
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
    select: {
      id: true,
      courseName: true,
      scheduledAt: true,
      completedAt: true,
      status: true,
      holes: true,
      startingHole: true,
      scoringMode: true,
      format: true,
      parData: true,
      players: {
        orderBy: { seat: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          seat: true,
          handicap: true,
          scores: { select: { hole: true, strokes: true } },
          user: {
            select: {
              avatarUrl: true,
              avatarSeed: true,
              avatarVariant: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    matches: matches.map((m) => ({
      id: m.id,
      courseName: m.courseName,
      scheduledAt: m.scheduledAt,
      completedAt: m.completedAt,
      status: m.status,
      holes: m.holes,
      startingHole: m.startingHole,
      scoringMode: m.scoringMode,
      format: m.format,
      pars: parseParData(m.parData, m.holes),
      myMatchPlayerId:
        m.players.find((p) => p.userId === user.id)?.id ?? null,
      players: m.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        seat: p.seat,
        handicap: p.handicap,
        avatarUrl: p.user?.avatarUrl ?? null,
        avatarSeed: p.user?.avatarSeed ?? null,
        avatarVariant: p.user?.avatarVariant ?? null,
        scoresByHole: Object.fromEntries(
          p.scores.map((s) => [s.hole, s.strokes]),
        ),
      })),
    })),
  });
}
