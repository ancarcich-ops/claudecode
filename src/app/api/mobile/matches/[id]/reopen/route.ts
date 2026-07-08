// POST /api/mobile/matches/:id/reopen -- un-finalize a completed round.
// Creator only. Reverts a COMPLETED match to IN_PROGRESS (if any scores
// exist) or UPCOMING (if none), clears completedAt + the winner
// snapshot, and re-records an odds snapshot -- mirrors the web
// reopenMatchAction. Idempotent-ish: reopening a non-completed match is
// a harmless no-op that still returns ok.
// 200: { "ok": true }   403 { "error": "..." }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { recordOddsSnapshot } from "@/lib/match";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: { players: { include: { scores: true } } },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can reopen it." },
      { status: 403 },
    );
  }

  const anyScores = match.players.some((p) => p.scores.length > 0);
  await prisma.match.update({
    where: { id: match.id },
    data: {
      status: anyScores ? "IN_PROGRESS" : "UPCOMING",
      completedAt: null,
      startedAt: anyScores ? match.startedAt ?? new Date() : null,
      winnerSummary: null,
    },
  });
  await recordOddsSnapshot(match.id);

  return NextResponse.json({ ok: true });
}
