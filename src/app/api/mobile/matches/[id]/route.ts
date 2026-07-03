// GET /api/mobile/matches/:id
// Auth: Bearer token (must be the creator or a seated player).
// The one-call payload the on-course native client needs: match meta,
// per-hole pars, every player's scores, and the course geometry
// (tee/green/front/back/polygons) plus hazards keyed by hole.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import {
  getCourseHolesByName,
  getCourseHazardsByName,
} from "@/lib/course";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      players: {
        orderBy: { seat: "asc" },
        include: { scores: { select: { hole: true, strokes: true } } },
      },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  const isCreator = match.createdById === user.id;
  const isSeated = match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isSeated) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }

  // Pars: the match snapshot wins (set at creation / by the editor);
  // fall back to all-4s so the client always gets `holes` entries.
  let pars: number[] = [];
  try {
    const parsed = match.parData ? JSON.parse(match.parData) : null;
    if (Array.isArray(parsed)) pars = parsed.map((p) => Number(p) || 4);
  } catch {}
  if (pars.length !== match.holes) {
    pars = Array(match.holes).fill(4);
  }

  const [holeGeo, hazards] = await Promise.all([
    getCourseHolesByName(match.courseName),
    getCourseHazardsByName(match.courseName),
  ]);

  return NextResponse.json({
    match: {
      id: match.id,
      courseName: match.courseName,
      scheduledAt: match.scheduledAt,
      status: match.status,
      holes: match.holes,
      startingHole: match.startingHole,
      scoringMode: match.scoringMode,
      format: match.format,
      isCreator,
      myMatchPlayerId:
        match.players.find((p) => p.userId === user.id)?.id ?? null,
      pars,
      players: match.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        handicap: p.handicap,
        seat: p.seat,
        team: p.team,
        scoresByHole: Object.fromEntries(
          p.scores.map((s) => [s.hole, s.strokes]),
        ),
      })),
    },
    // Keyed by absolute hole number. Polygons are arrays of {lat,lng}.
    holeGeo,
    hazards,
  });
}
