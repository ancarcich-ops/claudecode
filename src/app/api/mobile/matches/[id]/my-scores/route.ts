// DELETE /api/mobile/matches/:id/my-scores
// Auth: Bearer token. Removes ONLY the caller's own score entries for
// this match -- pulling the round out of their personal stats without
// touching the match, the other players' scores, or the roster. This
// is the "delete my score from a round I didn't start" action.
//
// Any seated player may do this (creator or not). It's surgical:
// ScoreEntry rows have no dependents, so nothing is orphaned, and
// every other player's scores stay exactly as they were. A round the
// caller has no scores on drops out of computeUserStats entirely
// (the rounds list, chart, index, and distribution all key off the
// caller having scores).
//
// 200: { "ok": true, "removed": <count> }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  // The caller's own seat in this match (linked by userId).
  const seat = await prisma.matchPlayer.findFirst({
    where: { matchId: params.id, userId: user.id },
    select: { id: true },
  });
  if (!seat) {
    // Not seated in this match -- nothing of theirs to remove.
    return NextResponse.json(
      { error: "You're not a player in this round." },
      { status: 403 },
    );
  }

  const { count } = await prisma.scoreEntry.deleteMany({
    where: { matchPlayerId: seat.id },
  });

  return NextResponse.json({ ok: true, removed: count });
}
