// POST /api/mobile/matches/:id/score
// Auth: Bearer token (creator or seated player).
// Body: { matchPlayerId: string, hole: number, strokes: number | null }
//   strokes null clears the score for that hole.
// Mirrors logScoreAction's rules: auto-flips an UPCOMING match to
// IN_PROGRESS on the first score, records an odds snapshot.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { recordOddsSnapshot } from "@/lib/match";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: {
    matchPlayerId?: string;
    hole?: number;
    strokes?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const matchPlayerId = String(body.matchPlayerId ?? "");
  const hole = Number(body.hole);
  if (!matchPlayerId || !Number.isFinite(hole) || hole < 1 || hole > 36) {
    return NextResponse.json(
      { error: "matchPlayerId and a valid hole are required" },
      { status: 400 },
    );
  }

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      createdById: true,
      players: { select: { id: true, userId: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  const isCreator = match.createdById === user.id;
  const isSeated = match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isSeated) {
    return NextResponse.json(
      { error: "Only players in this match can log scores" },
      { status: 403 },
    );
  }
  if (!match.players.some((p) => p.id === matchPlayerId)) {
    return NextResponse.json(
      { error: "That player is not in this match" },
      { status: 400 },
    );
  }

  if (body.strokes == null) {
    await prisma.scoreEntry
      .delete({ where: { matchPlayerId_hole: { matchPlayerId, hole } } })
      .catch(() => {});
  } else {
    const strokes = Number(body.strokes);
    if (!Number.isFinite(strokes) || strokes < 1 || strokes > 20) {
      return NextResponse.json(
        { error: "Strokes must be 1-20" },
        { status: 400 },
      );
    }
    await prisma.scoreEntry.upsert({
      where: { matchPlayerId_hole: { matchPlayerId, hole } },
      update: { strokes },
      create: { matchPlayerId, hole, strokes },
    });
  }

  if (match.status === "UPCOMING") {
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  } else {
    await prisma.match.update({
      where: { id: match.id },
      data: { updatedAt: new Date() },
    });
  }
  await recordOddsSnapshot(match.id);
  // Keep any open web views of this match fresh.
  revalidatePath(`/matches/${match.id}`);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
