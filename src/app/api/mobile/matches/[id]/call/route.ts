// POST /api/mobile/matches/:id/call -- place, change, or clear your
// "call" on the match: a crowd prediction of who wins. One call per user
// per match. Body: { "pickedPlayerId": "<matchPlayerId>" } to call that
// player, or { "pickedPlayerId": null } to withdraw your call. Mirrors
// the web placeWagerAction: upserts the wager, bumps the match, and
// re-records an odds snapshot so the crowd component moves the chart.
// 200: { ok: true, myCall, wagerCounts, totalCalls }.
// 400 when the market is closed (match COMPLETED) or the player isn't in
// the match.

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
    select: {
      id: true,
      status: true,
      players: { select: { id: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Market closed — this round is already final." },
      { status: 400 },
    );
  }

  let pickedPlayerId: string | null;
  try {
    const raw = (await req.json())?.pickedPlayerId;
    pickedPlayerId = raw == null ? null : String(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (pickedPlayerId === null || pickedPlayerId === "") {
    // Withdraw the caller's call, if any.
    await prisma.wager.deleteMany({
      where: { matchId: match.id, userId: user.id },
    });
  } else {
    if (!match.players.some((p) => p.id === pickedPlayerId)) {
      return NextResponse.json(
        { error: "That player isn't in this round." },
        { status: 400 },
      );
    }
    await prisma.wager.upsert({
      where: { matchId_userId: { matchId: match.id, userId: user.id } },
      update: { pickedPlayerId },
      create: { matchId: match.id, userId: user.id, pickedPlayerId },
    });
  }

  await prisma.match.update({
    where: { id: match.id },
    data: { updatedAt: new Date() },
  });
  await recordOddsSnapshot(match.id);

  // Fresh call counts for an immediate UI update without a full refetch.
  const grouped = await prisma.wager.groupBy({
    by: ["pickedPlayerId"],
    where: { matchId: match.id },
    _count: { pickedPlayerId: true },
  });
  const wagerCounts = Object.fromEntries(
    match.players.map((p) => [
      p.id,
      grouped.find((g) => g.pickedPlayerId === p.id)?._count.pickedPlayerId ?? 0,
    ]),
  );
  const totalCalls = grouped.reduce(
    (sum, g) => sum + g._count.pickedPlayerId,
    0,
  );

  return NextResponse.json({
    ok: true,
    myCall: pickedPlayerId === "" ? null : pickedPlayerId,
    wagerCounts,
    totalCalls,
  });
}
