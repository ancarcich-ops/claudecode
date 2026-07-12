// POST /api/mobile/matches/:id/side-game-event
// Record / toggle a per-hole side-game event -- the native equivalent of
// the web editors for the event-driven games:
//   SNAKE: kind "THREE_PUTT", matchPlayerId = who 3-putted (toggle).
//   BBB:   kind "BINGO"|"BANGO"|"BONGO", matchPlayerId = who (single-award).
//   WOLF:  kind "PARTNER"|"LONE_WOLF"|"PRE_LONE_WOLF" (mutex),
//          "HOLE_WINNER" (matchPlayerId) | "PUSH" (marker) (mutex).
//   MATCH: kind "PRESS" (pair-wide toggle).
// Body: { "kind": "THREE_PUTT", "hole": 7, "matchPlayerId"?: "…" }.
// The side game must already be enabled on the match (toggle it via
// POST /side-games first). Any seated player or the creator can record.
// 200: { "ok": true }. Uses the same writer as the web action.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { canScoreMatch } from "@/lib/matchAccess";
import {
  gameKindForEventKind,
  writeSideGameEvent,
} from "@/lib/sideGameEvents";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: { kind?: unknown; hole?: unknown; matchPlayerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const kind = String(body.kind ?? "").trim();
  const hole = Number(body.hole);
  const matchPlayerId =
    String(body.matchPlayerId ?? "").trim() || null;
  const gameKind = gameKindForEventKind(kind);
  if (!gameKind || !Number.isFinite(hole) || hole < 1) {
    return NextResponse.json(
      { error: "Invalid side-game event." },
      { status: 400 },
    );
  }

  // Auth: the match must exist and the caller must be the creator or a
  // seated player. Also grab the enabled side game of the owning kind.
  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      createdById: true,
      groupId: true,
      players: { select: { id: true, userId: true } },
      sideGames: { select: { id: true, kind: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (!(await canScoreMatch(user.id, match))) {
    return NextResponse.json(
      { error: "Only players in this round can record events." },
      { status: 403 },
    );
  }
  const sideGame = match.sideGames.find((sg) => sg.kind === gameKind);
  if (!sideGame) {
    return NextResponse.json(
      { error: `Turn on ${gameKind} for this round first.` },
      { status: 400 },
    );
  }
  // If a player is named, it must be in this match.
  if (matchPlayerId && !match.players.some((p) => p.id === matchPlayerId)) {
    return NextResponse.json(
      { error: "That player isn't in this round." },
      { status: 400 },
    );
  }

  try {
    await writeSideGameEvent({
      sideGameId: sideGame.id,
      hole,
      kind,
      matchPlayerId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't record event." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
