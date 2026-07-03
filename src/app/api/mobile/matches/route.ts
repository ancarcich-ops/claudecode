// GET /api/mobile/matches
// Auth: Bearer token.
// Returns the caller's matches (creator or seated), most recent first.
// 200: { matches: [{ id, courseName, scheduledAt, status, holes,
//        startingHole, scoringMode, format, players: [{ id,
//        displayName, seat }] }] }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

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
      status: true,
      holes: true,
      startingHole: true,
      scoringMode: true,
      format: true,
      players: {
        orderBy: { seat: "asc" },
        select: { id: true, displayName: true, seat: true },
      },
    },
  });

  return NextResponse.json({ matches });
}
