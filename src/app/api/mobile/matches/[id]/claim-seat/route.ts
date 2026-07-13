// POST /api/mobile/matches/:id/claim-seat
// Body: { "matchPlayerId": "..." }
// Links an unlinked (name-only) seat in the round to the caller's account,
// so the round counts toward their stats/feeds. Mirrors the web
// claimSeatAction. Guarded: caller must be able to see the round (a member
// of its group, or it's public), the seat must be unclaimed, and the
// caller can't already hold a seat in the round.
// 200: { ok: true, matchPlayerId }.  400/403/404: { error }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { isGroupMember } from "@/lib/matchAccess";
import { recordOddsSnapshot } from "@/lib/match";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: { matchPlayerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const matchPlayerId = String(body.matchPlayerId ?? "").trim();
  if (!matchPlayerId) {
    return NextResponse.json({ error: "Seat required." }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      groupId: true,
      players: { select: { id: true, userId: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const canClaim = match.groupId
    ? await isGroupMember(match.groupId, user.id)
    : true;
  if (!canClaim) {
    return NextResponse.json(
      { error: "You can't claim a seat in this round." },
      { status: 403 },
    );
  }
  if (match.players.some((p) => p.userId === user.id)) {
    return NextResponse.json(
      { error: "You already have a seat in this round." },
      { status: 400 },
    );
  }
  const seat = match.players.find((p) => p.id === matchPlayerId);
  if (!seat) {
    return NextResponse.json(
      { error: "That player is not in this round." },
      { status: 400 },
    );
  }
  if (seat.userId) {
    return NextResponse.json(
      { error: "That seat is already claimed." },
      { status: 400 },
    );
  }

  await prisma.matchPlayer.update({
    where: { id: seat.id },
    data: { userId: user.id },
  });
  await recordOddsSnapshot(params.id);
  revalidatePath(`/matches/${params.id}`);
  revalidatePath("/");

  return NextResponse.json({ ok: true, matchPlayerId });
}
