// POST /api/mobile/tournaments/join -- join a tournament by invite code.
// Body: { "code": "ABC123", "handicap"?: 12.4 }. Idempotent (rejoining is
// a no-op). Mirrors the web joinTournamentAction. 200: { tournament: { id } }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: { code?: unknown; handicap?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Invite code required." }, { status: 400 });
  }
  const handicapRaw = Number(body.handicap);
  const handicapAtStart = Number.isFinite(handicapRaw) ? handicapRaw : null;

  const tournament = await prisma.tournament.findFirst({
    where: { inviteCode: code },
    include: { roster: { select: { userId: true, displayName: true } } },
  });
  if (!tournament) {
    return NextResponse.json(
      { error: `No tournament matches code ${code}.` },
      { status: 404 },
    );
  }

  // Already in -> no-op success.
  if (tournament.roster.some((r) => r.userId === user.id)) {
    return NextResponse.json({ tournament: { id: tournament.id } });
  }

  // Disambiguate against the @@unique([tournamentId, displayName]).
  let finalName = user.displayName ?? user.username;
  const taken = new Set(
    tournament.roster.map((r) => r.displayName.toLowerCase()),
  );
  if (taken.has(finalName.toLowerCase())) {
    let n = 2;
    while (taken.has(`${finalName} (${n})`.toLowerCase())) n++;
    finalName = `${finalName} (${n})`;
  }

  await prisma.tournamentPlayer.create({
    data: {
      tournamentId: tournament.id,
      displayName: finalName,
      userId: user.id,
      handicapAtStart,
    },
  });

  return NextResponse.json({ tournament: { id: tournament.id } });
}
