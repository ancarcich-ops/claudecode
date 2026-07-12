// POST /api/mobile/matches/:id/complete
// Auth: Bearer token (creator or seated player -- same trust as the
// web's Mark final, which any signed-in participant can trigger).
// Marks the match COMPLETED via the same finalization steps as the
// web action: status + completedAt, odds snapshot, winner
// persistence, tournament rollup.
// 200: { ok: true }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { recordOddsSnapshot } from "@/lib/match";
import { computeAndPersistMatchWinners } from "@/lib/matchWinners";
import { rollupTournamentCompletion } from "@/lib/autoComplete";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      createdById: true,
      players: { select: { userId: true } },
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
  if (match.status === "COMPLETED") {
    // Idempotent: double-taps and races with the auto-complete sweep
    // are fine.
    return NextResponse.json({ ok: true });
  }

  const completed = await prisma.match.update({
    where: { id: match.id },
    data: { status: "COMPLETED", completedAt: new Date() },
    select: { tournamentId: true },
  });
  await recordOddsSnapshot(match.id);
  await computeAndPersistMatchWinners(match.id);
  if (completed.tournamentId) {
    await rollupTournamentCompletion(completed.tournamentId);
    revalidatePath(`/tournaments/${completed.tournamentId}`);
  }
  revalidatePath(`/matches/${match.id}`);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
